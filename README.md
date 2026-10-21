# EIMS — Equipment Incident Management System

## Run the app

When opening the application from a protected network share, double-click `Start-EIMS.cmd` (Python 3 must be installed). Keep the server window open and visit the address it displays.

The launcher keeps the live database on the host computer at `%LOCALAPPDATA%\EIMS\forge.sqlite3`, not on the network share. Every computer that starts its own launcher gets its own database; this is **not** a shared team database. For one common incident list, employees must connect to the same approved host server rather than start separate copies.

The launcher follows your existing PowerShell execution policy. If your organization blocks scripts, ask IT to approve/sign the launcher, or run Python directly with an explicit local database path.

From this folder in PowerShell:

```powershell
python server.py
```

Open [http://localhost:8000](http://localhost:8000). Run the server whenever the app is in use; opening `index.html` directly does not connect to the database.

When running directly from a network share, specify a local database:

```powershell
python server.py --db "$env:LOCALAPPDATA\EIMS\forge.sqlite3"
```

## Saved data

Incident reports are stored in `data\forge.sqlite3` on the server, not in an individual employee's browser. Every employee using the same running server sees the shared incident list. Back up this database file regularly.

The existing database filename is retained after the EIMS rename so previously saved records remain available.

The network-share deployment includes application files only. It does not move, overwrite, or merge existing incident databases.

## Typography

EIMS uses locally installed Segoe UI Variable / Segoe UI fonts with system fallbacks. No external font downloads or internet connection are required.

## Equipment corrections

The current equipment list uses VIB101, VIB201, and BPQ101. On server startup,
existing reports using MB101, MB201, MPG101, or BPG101 are updated to those
corrected IDs without changing incident IDs or other report details.
DOR101 is excluded from new reports and the equipment directory; historical
DOR101 reports are retained.

The server listens on this computer only by default. For team access, deploy it on an approved shared host and configure your organization's authentication and network controls before exposing it to other computers. The app refreshes shared incidents every 15 seconds.

This prototype does not provide employee sign-in or access control. Do not expose it directly to the public internet; use an organization-approved authentication layer and private network before team deployment.
