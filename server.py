from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR / "data" / "forge.sqlite3"
ID_PATTERN = re.compile(r"^INC-(\d{4,})$")
ALLOWED_PRIORITIES = {"Low", "Medium", "High", "Critical"}
ALLOWED_STATUSES = {"Open", "In Progress", "Resolved"}
ALLOWED_EQUIPMENT = {
    "BPD101", "BPD102", "BPD110", "BPD111", "BPQ101",
    "FDA103", "FDA104", "FDA204", "FDA206", "FDB101", "FDB102", "FDB103", "FDE101", "FDE102",
    "ORL101", "ORL102", "ORL104", "ORL105", "ORL106", "ORL204", "ORL205",
    "PAL202", "PAL204", "PAL205", "PAL206", "PCD101", "PCD102", "PCD103",
    "SRC101", "SRC102", "SRC103", "SRI104", "SRI105", "SRK201", "SRK202", "SRK203", "SRN101",
    "UDC101", "UDC102", "UDC103", "UDC107", "UDC108", "UDC201", "UDC202", "UDC205", "UDC206",
    "UDC207", "UDC208", "UDC209", "UDC210", "UDC211", "UDC213",
    "UDL101", "UDL102", "UDL103", "UDL104", "UDL105", "UDL106", "UDL109", "UDL111",
    "UDL113", "UDL114", "UDL115", "UDL116", "UDN101", "VIB101", "VIB201",
}
EQUIPMENT_CORRECTIONS = {
    "MB101": "VIB101",
    "MB201": "VIB201",
    "MPG101": "BPQ101",
    "BPG101": "BPQ101",
}
STRING_FIELDS = ("title", "tool", "priority", "status", "reporter", "owner", "description", "rootCause", "action")


def connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS incident_records (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                payload_json TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ('incident_records', 6)"
        )
        connection.execute(
            "UPDATE sqlite_sequence SET seq = MAX(seq, 6) WHERE name = 'incident_records'"
        )
        rows = connection.execute(
            "SELECT sequence, payload_json FROM incident_records"
        ).fetchall()
        for row in rows:
            incident = json.loads(row["payload_json"])
            corrected_tool = EQUIPMENT_CORRECTIONS.get(incident.get("tool"))
            if corrected_tool:
                incident["tool"] = corrected_tool
                connection.execute(
                    "UPDATE incident_records SET payload_json = ? WHERE sequence = ?",
                    (json.dumps(incident, ensure_ascii=False), row["sequence"]),
                )


def validate_incident(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("Incident data must be a JSON object.")

    for field in STRING_FIELDS:
        item = value.get(field, "")
        if not isinstance(item, str):
            raise ValueError(f"{field} must be text.")
        value[field] = item.strip()

    if not value["title"] or len(value["title"]) > 100:
        raise ValueError("Enter an incident title of 1 to 100 characters.")
    if value["tool"] not in ALLOWED_EQUIPMENT:
        raise ValueError("Select a valid equipment ID.")
    if value["priority"] not in ALLOWED_PRIORITIES:
        raise ValueError("Select a valid incident priority.")
    if value["status"] not in ALLOWED_STATUSES:
        raise ValueError("Select a valid incident status.")
    if not value["description"] or len(value["description"]) > 1200:
        raise ValueError("Enter a problem description of 1 to 1200 characters.")
    if not value["reporter"]:
        raise ValueError("Enter the employee name who is reporting the incident.")
    if len(value["reporter"]) > 80 or len(value["owner"]) > 80:
        raise ValueError("Reporter and assignee names must be 80 characters or fewer.")
    if len(value["rootCause"]) > 1200 or len(value["action"]) > 1200:
        raise ValueError("Investigation notes and corrective actions must be 1200 characters or fewer.")

    downtime = value.get("downtime", 0)
    if isinstance(downtime, bool) or not isinstance(downtime, int) or downtime < 0:
        raise ValueError("Downtime must be a non-negative whole number of minutes.")
    value["downtime"] = downtime

    for field in ("startTime", "detectionTime"):
        timestamp = value.get(field)
        if not isinstance(timestamp, str) or not timestamp:
            raise ValueError(f"{field} is required.")
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    created_at = value.get("createdAt")
    if created_at is not None:
        if not isinstance(created_at, str):
            raise ValueError("createdAt must be a timestamp.")
        datetime.fromisoformat(created_at.replace("Z", "+00:00"))

    value["owner"] = value["owner"] or ""
    value["rootCause"] = value["rootCause"] or ""
    value["action"] = value["action"] or ""
    value["createdAt"] = value.get("createdAt") or datetime.now(timezone.utc).isoformat()
    return value


class ForgeHandler(SimpleHTTPRequestHandler):
    server_version = "ForgeIncidentServer/1.0"

    def __init__(self, *args, db_path: Path, **kwargs):
        self.db_path = db_path
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def send_json(self, status: int, value: object) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> object:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid request body length.") from error
        if length <= 0 or length > 1_000_000:
            raise ValueError("Request body must be between 1 byte and 1 MB.")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except UnicodeDecodeError as error:
            raise ValueError("Request body must be UTF-8 JSON.") from error

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/health":
            self.send_json(200, {"status": "ok"})
            return
        if path != "/api/incidents":
            super().do_GET()
            return
        try:
            with connect(self.db_path) as connection:
                rows = connection.execute(
                    "SELECT sequence, payload_json FROM incident_records ORDER BY sequence DESC"
                ).fetchall()
            result = []
            for row in rows:
                item = json.loads(row["payload_json"])
                item["id"] = f"INC-{row['sequence'] + 1042}"
                result.append(item)
            self.send_json(200, result)
        except (sqlite3.Error, json.JSONDecodeError) as error:
            self.log_error("Unable to read incident database: %s", error)
            self.send_json(500, {"error": "Incident data could not be read from the database."})

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/incidents":
            self.send_json(404, {"error": "Endpoint not found."})
            return
        try:
            incident = validate_incident(self.read_json())
            provided_id = incident.pop("id", None)
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error) or "Invalid JSON request."})
            return

        requested_sequence = None
        if provided_id is not None:
            match = ID_PATTERN.fullmatch(provided_id) if isinstance(provided_id, str) else None
            if not match:
                self.send_json(400, {"error": "Incident ID has an invalid format."})
                return
            requested_sequence = int(match.group(1)) - 1042
            if requested_sequence < 1:
                self.send_json(400, {"error": "Incident ID is outside the supported range."})
                return

        try:
            with connect(self.db_path) as connection:
                if requested_sequence is None:
                    cursor = connection.execute(
                        "INSERT INTO incident_records (payload_json) VALUES (?)",
                        (json.dumps(incident, ensure_ascii=False),),
                    )
                    sequence = cursor.lastrowid
                else:
                    connection.execute(
                        "INSERT INTO incident_records (sequence, payload_json) VALUES (?, ?)",
                        (requested_sequence, json.dumps(incident, ensure_ascii=False)),
                    )
                    sequence = requested_sequence
                saved = dict(incident)
                saved["id"] = f"INC-{sequence + 1042}"
            self.send_json(201, saved)
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "That incident ID already exists. Refresh and try again."})
        except sqlite3.Error as error:
            self.log_error("Unable to save incident: %s", error)
            self.send_json(500, {"error": "Incident could not be saved to the database."})

    def do_PATCH(self) -> None:
        path = urlsplit(self.path).path
        prefix = "/api/incidents/"
        if not path.startswith(prefix):
            self.send_json(404, {"error": "Endpoint not found."})
            return
        incident_id = unquote(path[len(prefix):])
        match = ID_PATTERN.fullmatch(incident_id)
        if not match:
            self.send_json(400, {"error": "Incident ID has an invalid format."})
            return
        try:
            changes = self.read_json()
            if not isinstance(changes, dict) or set(changes) != {"status"} or not isinstance(changes["status"], str) or changes["status"] not in ALLOWED_STATUSES:
                raise ValueError("Select a valid incident status.")
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error) or "Invalid JSON request."})
            return

        sequence = int(match.group(1)) - 1042
        try:
            with connect(self.db_path) as connection:
                row = connection.execute(
                    "SELECT payload_json FROM incident_records WHERE sequence = ?", (sequence,)
                ).fetchone()
                if row is None:
                    self.send_json(404, {"error": "Incident not found."})
                    return
                incident = json.loads(row["payload_json"])
                incident["status"] = changes["status"]
                connection.execute(
                    "UPDATE incident_records SET payload_json = ? WHERE sequence = ?",
                    (json.dumps(incident, ensure_ascii=False), sequence),
                )
            incident["id"] = incident_id
            self.send_json(200, incident)
        except (sqlite3.Error, json.JSONDecodeError) as error:
            self.log_error("Unable to update incident: %s", error)
            self.send_json(500, {"error": "Incident status could not be saved."})

    def do_OPTIONS(self) -> None:
        self.send_json(405, {"error": "Method not allowed."})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Forge incident management app.")
    parser.add_argument("--host", default="127.0.0.1", help="Interface to bind to (default: 127.0.0.1).")
    parser.add_argument("--port", type=int, default=8000, help="HTTP port (default: 8000).")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="SQLite database file.")
    arguments = parser.parse_args()
    db_path = arguments.db.resolve()
    initialize_database(db_path)

    handler = lambda *args, **kwargs: ForgeHandler(*args, db_path=db_path, **kwargs)
    server = ThreadingHTTPServer((arguments.host, arguments.port), handler)
    print(f"Forge is running at http://{arguments.host}:{arguments.port}")
    print(f"Incident database: {db_path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Forge.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
