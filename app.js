(() => {
  "use strict";

  const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];
  const PRIORITY_COLORS = { Critical: "#e36768", High: "#e49a4a", Medium: "#e5b94e", Low: "#6d9ed1" };
  const EQUIPMENT = [
    "BPD101", "BPD102", "BPD110", "BPD111", "BPQ101",
    "FDA103", "FDA104", "FDA204", "FDA206", "FDB101", "FDB102", "FDB103", "FDE101", "FDE102",
    "ORL101", "ORL102", "ORL104", "ORL105", "ORL106", "ORL204", "ORL205",
    "PAL202", "PAL204", "PAL205", "PAL206", "PCD101", "PCD102", "PCD103",
    "SRC101", "SRC102", "SRC103", "SRI104", "SRI105", "SRK201", "SRK202", "SRK203", "SRN101",
    "UDC101", "UDC102", "UDC103", "UDC107", "UDC108", "UDC201", "UDC202", "UDC205", "UDC206",
    "UDC207", "UDC208", "UDC209", "UDC210", "UDC211", "UDC213",
    "UDL101", "UDL102", "UDL103", "UDL104", "UDL105", "UDL106", "UDL109", "UDL111",
    "UDL113", "UDL114", "UDL115", "UDL116", "UDN101", "VIB101", "VIB201"
  ];
  const API_URL = "/api/incidents";
  const SAMPLE_INCIDENTS = [
    { id: "INC-1048", title: "Hydraulic pressure dropped during cycle", tool: "BPD101", priority: "Critical", status: "In Progress", reporter: "Hussen Mazaraua", owner: "A. Ibrahim", description: "Pressure dropped below operating threshold on the return stroke. The equipment was paused and the hydraulic circuit is under inspection.", rootCause: "Possible seal wear on the primary cylinder.", action: "Equipment isolated. Maintenance team checking seals and pressure sensor.", downtime: 42, createdAt: hoursAgo(1), startTime: hoursAgo(2), detectionTime: hoursAgo(1) },
    { id: "INC-1047", title: "Cycle not completing as expected", tool: "UDC201", priority: "High", status: "Open", reporter: "M. Chen", owner: "", description: "The automatic sequence pauses partway through operation. No fault code is shown on the controller.", rootCause: "", action: "", downtime: 0, createdAt: hoursAgo(3), startTime: hoursAgo(4), detectionTime: hoursAgo(3) },
    { id: "INC-1046", title: "Intermittent sensor fault", tool: "ORL104", priority: "Medium", status: "In Progress", reporter: "J. Okafor", owner: "L. Patel", description: "The proximity sensor reports intermittent product presence while equipment is running at standard speed.", rootCause: "Sensor alignment may have shifted after the last changeover.", action: "Realigning the bracket and validating sensor response.", downtime: 15, createdAt: hoursAgo(7), startTime: hoursAgo(9), detectionTime: hoursAgo(7) },
    { id: "INC-1045", title: "Operating pressure below range", tool: "FDA204", priority: "Low", status: "Resolved", reporter: "L. Patel", owner: "L. Patel", description: "Operating pressure was slow to recover after routine maintenance.", rootCause: "Drain valve had not been fully closed after inspection.", action: "Valve secured and pressure returned to normal. Monitored for 30 minutes.", downtime: 8, createdAt: hoursAgo(23), startTime: hoursAgo(24), detectionTime: hoursAgo(23) },
    { id: "INC-1044", title: "Product jam at equipment infeed", tool: "UDL109", priority: "High", status: "Open", reporter: "A. Ibrahim", owner: "", description: "Products are bunching at the infeed guide during speed changes, interrupting the operating sequence.", rootCause: "", action: "", downtime: 0, createdAt: hoursAgo(30), startTime: hoursAgo(31), detectionTime: hoursAgo(30) },
    { id: "INC-1043", title: "Home position drift detected", tool: "VIB101", priority: "Medium", status: "Resolved", reporter: "M. Chen", owner: "A. Ibrahim", description: "The arm returned approximately 4 mm off its recorded home position after a controlled stop.", rootCause: "Backup battery nearing replacement interval.", action: "Home position reset; battery replacement scheduled.", downtime: 22, createdAt: hoursAgo(52), startTime: hoursAgo(55), detectionTime: hoursAgo(52) }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }
  const relativeTime = (iso) => {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
  };
  const dateTimeLabel = (iso) => iso ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "Not provided";
  const statusClass = (status) => status.toLowerCase().replace(/\s+/g, "-");
  const priorityClass = (priority) => priority.toLowerCase();
  let incidents = [];
  let currentView = "incidents";
  let toastTimer;
  let syncInProgress = false;
  const form = $("#incident-form");
  const dialog = $("#incident-dialog");
  const detailDialog = $("#detail-dialog");
  const incidentView = $("#incident-view");
  const dashboardView = $("#dashboard-view");
  const otherView = $("#other-view");

  async function requestAPI(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...options.headers }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Server request failed (${response.status}).`);
    return result;
  }

  function setConnectionState(state) {
    const indicator = $("#connection-status");
    indicator.dataset.state = state;
    indicator.lastChild.textContent = state === "connected" ? " Live · Connected to database" : state === "connecting" ? " Connecting to database" : " Database unavailable";
  }

  async function loadIncidents() {
    setConnectionState("connecting");
    try {
      incidents = await requestAPI(API_URL);
      setConnectionState("connected");
      render();
    } catch (error) {
      console.error("Unable to load incidents from the server.", error);
      setConnectionState("disconnected");
      $("#empty-state h3").textContent = "Couldn't connect to the database";
      $("#empty-state p").textContent = "Check that the EIMS server is running, then refresh this page. Your reports will be saved on the server.";
      $("#empty-state").classList.add("visible");
      $("#incidents-table").closest("table").classList.add("hidden");
      showToast("Incident data could not be loaded.");
    }
  }

  async function synchronizeIncidents() {
    if (syncInProgress || document.visibilityState !== "visible") return;
    syncInProgress = true;
    try {
      const latest = await requestAPI(API_URL);
      setConnectionState("connected");
      if (JSON.stringify(latest) !== JSON.stringify(incidents)) {
        incidents = latest;
        render();
      }
    } catch (error) {
      console.error("Unable to synchronize shared incidents.", error);
      setConnectionState("disconnected");
    } finally {
      syncInProgress = false;
    }
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i aria-hidden="true">✓</i><span>${escapeHTML(message)}</span>`;
    $("#toast-region").append(toast);
    window.setTimeout(() => toast.remove(), 3500);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      const region = $("#toast-region");
      if (region && !region.children.length) region.replaceChildren();
    }, 3600);
  }

  function render() {
    $("#empty-state h3").textContent = "No incidents to show";
    $("#empty-state p").textContent = "Everything is clear. Report an incident or load sample data to explore the workspace.";
    const search = $("#search-input").value.trim().toLowerCase();
    const status = $("#status-filter").value;
    const priority = $("#priority-filter").value;
    const filtered = incidents.filter((incident) => {
      const matchesSearch = !search || [incident.id, incident.title, incident.tool, incident.reporter, incident.owner].some((value) => String(value || "").toLowerCase().includes(search));
      return matchesSearch && (!status || incident.status === status) && (!priority || incident.priority === priority);
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    $("#metric-open").textContent = incidents.filter((item) => item.status === "Open").length;
    $("#metric-progress").textContent = incidents.filter((item) => item.status === "In Progress").length;
    $("#metric-critical").textContent = incidents.filter((item) => item.priority === "Critical" && item.status !== "Resolved").length;
    const now = new Date();
    $("#metric-resolved").textContent = incidents.filter((item) => {
      const date = new Date(item.createdAt);
      return item.status === "Resolved" && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
    $("#nav-count").textContent = incidents.filter((item) => item.status !== "Resolved").length;
    $("#result-count").textContent = filtered.length;
    $("#table-summary").textContent = `Showing ${filtered.length} of ${incidents.length} incident${incidents.length === 1 ? "" : "s"}`;

    const body = $("#incidents-table");
    body.innerHTML = filtered.map((incident) => `<tr>
      <td><button class="incident-link" type="button" data-open-incident="${escapeHTML(incident.id)}">${escapeHTML(incident.title)}</button><span class="incident-id">${escapeHTML(incident.id)}</span></td>
      <td><span class="equipment-name">${escapeHTML(incident.tool)}</span></td>
      <td><span class="priority-badge priority-${priorityClass(incident.priority)}">${escapeHTML(incident.priority)}</span></td>
      <td><span class="status-badge status-${statusClass(incident.status)}">${escapeHTML(incident.status)}</span></td>
      <td><span class="reported-date" title="${escapeHTML(dateTimeLabel(incident.createdAt))}">${escapeHTML(relativeTime(incident.createdAt))}</span></td>
      <td><button class="row-action" type="button" data-open-incident="${escapeHTML(incident.id)}" aria-label="View ${escapeHTML(incident.id)}">···</button></td>
    </tr>`).join("");
    $("#empty-state").classList.toggle("visible", filtered.length === 0);
    $("#incidents-table").closest("table").classList.toggle("hidden", filtered.length === 0);
    renderHealth();
    renderEquipmentDirectory();
    renderActivity();
    renderDashboard();
  }

  function renderHealth() {
    const active = incidents.filter((incident) => incident.status !== "Resolved" && EQUIPMENT.includes(incident.tool));
    const impacted = new Set(active.map((incident) => incident.tool.toLowerCase())).size;
    const totalEquipment = EQUIPMENT.length;
    const score = Math.max(0, Math.round((totalEquipment - Math.min(impacted, totalEquipment)) / totalEquipment * 100));
    $("#health-score").textContent = score;
    $("#health-bar").style.width = `${score}%`;
    $("#equipment-count").textContent = `${impacted} of ${totalEquipment} impacted`;
  }

  function renderEquipmentDirectory() {
    const search = $("#equipment-search").value.trim().toLowerCase();
    const filtered = EQUIPMENT.filter((code) => code.toLowerCase().includes(search));
    $("#equipment-directory-count").textContent = filtered.length;
    $("#equipment-directory-list").innerHTML = filtered.map((code) => {
      const activeCount = incidents.filter((item) => item.tool === code && item.status !== "Resolved").length;
      const itemCount = incidents.filter((item) => item.tool === code).length;
      return `<article class="equipment-card"><span class="equipment-card-icon"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16V7l6-3 6 3v9M7 16v-4h6v4M2.5 16h15"/></svg></span><div class="equipment-card-copy"><strong>${escapeHTML(code)}</strong><span>${itemCount} incident${itemCount === 1 ? "" : "s"} recorded</span></div><span class="equipment-state ${activeCount ? "equipment-attention" : ""}"><i></i>${activeCount ? `${activeCount} active` : "Operational"}</span></article>`;
    }).join("") || `<div class="directory-empty">No equipment matches “${escapeHTML(search)}”.</div>`;
  }

  function renderActivity() {
    const latest = [...incidents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
    $("#activity-list").innerHTML = latest.length ? latest.map((incident) => {
      const sentence = `reported an issue on <strong>${escapeHTML(incident.tool)}</strong>`;
      const reporter = incident.reporter || "Employee";
      const initials = reporter.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      return `<div class="activity-item"><span class="activity-mark">${escapeHTML(initials)}</span><div class="activity-copy"><p><strong>${escapeHTML(reporter)}</strong> ${sentence}</p><time>${escapeHTML(relativeTime(incident.createdAt))}</time></div></div>`;
    }).join("") : `<div class="activity-empty">Your team's latest updates will appear here.</div>`;
  }

  function renderDashboard() {
    const priorityCounts = Object.fromEntries(PRIORITY_ORDER.map((priority) => [priority, incidents.filter((item) => item.priority === priority).length]));
    const total = incidents.length || 1;
    $("#priority-chart").innerHTML = PRIORITY_ORDER.map((priority) => {
      const count = priorityCounts[priority];
      return `<div class="chart-row"><span>${priority}</span><div class="chart-track"><span style="width:${Math.max(count ? 4 : 0, count / total * 100)}%;background:${PRIORITY_COLORS[priority]}"></span></div><strong class="chart-value">${count}</strong></div>`;
    }).join("");
    const statusCounts = ["Open", "In Progress", "Resolved"].map((status) => [status, incidents.filter((item) => item.status === status).length]);
    $("#status-chart").innerHTML = `<div class="status-total">${incidents.length}<small>Total incidents</small></div><div class="status-legend">${statusCounts.map(([status, count]) => `<div><i style="background:${status === "Resolved" ? "#42ad83" : status === "In Progress" ? "#5796d5" : "#a6b0bd"}"></i>${status}<strong>${count}</strong></div>`).join("")}</div>`;
    const equipment = Object.entries(incidents.reduce((counts, incident) => {
      counts[incident.tool] = (counts[incident.tool] || 0) + 1;
      return counts;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCount = equipment.length ? equipment[0][1] : 1;
    $("#equipment-breakdown").innerHTML = equipment.length ? equipment.map(([name, count], index) => `<div class="equipment-row"><span class="equipment-rank">0${index + 1}</span><span>${escapeHTML(name)}</span><div class="equipment-bar"><span style="width:${count / maxCount * 100}%"></span></div><strong>${count}</strong></div>`).join("") : `<div class="activity-empty">Equipment data will appear here when incidents are reported.</div>`;
  }

  function openIncidentDialog() {
    form.reset();
    form.elements.reporter.value = "";
    form.elements.priority.value = "Medium";
    form.elements.status.value = "Open";
    $("#advanced-fields").classList.add("hidden");
    $("#advanced-toggle").setAttribute("aria-expanded", "false");
    $("#advanced-toggle").innerHTML = "＋ Add investigation details <span>Optional</span>";
    dialog.showModal();
  }

  function closeDialog() {
    dialog.close();
  }

  function openDetails(id) {
    const incident = incidents.find((item) => item.id === id);
    if (!incident) return;
    const optionalDetail = (title, value) => value ? `<section class="detail-extra"><h3>${title}</h3><p>${escapeHTML(value)}</p></section>` : "";
    $("#detail-content").innerHTML = `<div class="detail-content">
      <div class="detail-top"><div><span class="incident-id">${escapeHTML(incident.id)}</span><h2 id="detail-title">${escapeHTML(incident.title)}</h2></div><button class="dialog-close" id="close-detail" type="button" aria-label="Close incident details">×</button></div>
      <div><span class="priority-badge priority-${priorityClass(incident.priority)}">${escapeHTML(incident.priority)}</span> <span class="status-badge status-${statusClass(incident.status)}">${escapeHTML(incident.status)}</span></div>
      <p class="detail-description">${escapeHTML(incident.description || "No description provided.")}</p>
      <div class="detail-meta"><div><span>Equipment</span><strong>${escapeHTML(incident.tool)}</strong></div><div><span>Reported by</span><strong>${escapeHTML(incident.reporter || "Not provided")}</strong></div><div><span>Assigned to</span><strong>${escapeHTML(incident.owner || "Unassigned")}</strong></div><div><span>Reported</span><strong>${escapeHTML(dateTimeLabel(incident.createdAt))}</strong></div><div><span>Issue started</span><strong>${escapeHTML(dateTimeLabel(incident.startTime))}</strong></div><div><span>Detection time</span><strong>${escapeHTML(dateTimeLabel(incident.detectionTime))}</strong></div><div><span>Downtime</span><strong>${incident.downtime ? `${escapeHTML(incident.downtime)} minutes` : "Not recorded"}</strong></div></div>
      ${optionalDetail("Root cause / investigation", incident.rootCause)}${optionalDetail("Corrective action", incident.action)}
      <div class="detail-actions">${incident.status !== "Resolved" ? `<button class="button button-secondary" type="button" id="advance-status">${incident.status === "Open" ? "Start investigation" : "Mark resolved"}</button>` : `<button class="button button-secondary" type="button" id="reopen-incident">Reopen incident</button>`}</div>
    </div>`;
    detailDialog.showModal();
    $("#close-detail").addEventListener("click", () => detailDialog.close());
    const advance = $("#advance-status");
    if (advance) advance.addEventListener("click", async () => {
      const status = incident.status === "Open" ? "In Progress" : "Resolved";
      try {
        Object.assign(incident, await requestAPI(`${API_URL}/${encodeURIComponent(incident.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        }));
        detailDialog.close();
        render();
        showToast(`${incident.id} status updated to ${incident.status}.`);
      } catch (error) {
        console.error("Unable to update incident status.", error);
        showToast(`Status was not saved: ${error.message}`);
      }
    });
    const reopen = $("#reopen-incident");
    if (reopen) reopen.addEventListener("click", async () => {
      try {
        Object.assign(incident, await requestAPI(`${API_URL}/${encodeURIComponent(incident.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "Open" })
        }));
        detailDialog.close();
        render();
        showToast(`${incident.id} has been reopened.`);
      } catch (error) {
        console.error("Unable to reopen incident.", error);
        showToast(`Incident was not reopened: ${error.message}`);
      }
    });
  }

  function setView(view) {
    currentView = view;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const isIncidents = view === "incidents";
    const isDashboard = view === "dashboard";
    incidentView.classList.toggle("hidden", !isIncidents);
    dashboardView.classList.toggle("hidden", !isDashboard);
    otherView.classList.toggle("hidden", isIncidents || isDashboard);
    $(".metrics-grid").classList.toggle("hidden", !isIncidents);
    $("#equipment-directory").classList.toggle("hidden", view !== "tools");
    $("#generic-other-panel").classList.toggle("hidden", isIncidents || isDashboard || view === "tools");
    const titles = { incidents: ["Incidents", "Incident management", "Track issues, coordinate investigations, and keep your equipment running."], dashboard: ["Overview", "Operations overview", "A clear picture of equipment reliability and incident trends."], tools: ["Equipment", "Equipment", "Review the equipment involved in your team's incident reports."], activity: ["Activity log", "Activity log", "Follow incident updates and the actions taken across your workspace."], settings: ["Settings", "Workspace settings", "Manage your operations workspace and reporting preferences."] };
    const [breadcrumb, title, subtitle] = titles[view] || titles.incidents;
    $("#breadcrumb-current").textContent = breadcrumb;
    $("#page-title").textContent = title;
    $("#page-subtitle").textContent = subtitle;
    if (!isIncidents && !isDashboard) {
      $("#other-view-title").textContent = title;
      $("#other-view-description").textContent = subtitle;
    }
  }

  function exportCSV() {
    if (!incidents.length) {
      showToast("There are no incidents to export yet.");
      return;
    }
    const columns = ["Incident ID", "Title", "Equipment", "Priority", "Status", "Reported by", "Assigned to", "Description", "Root cause", "Corrective action", "Downtime minutes", "Issue start time", "Detection time", "Reported at"];
    const values = incidents.map((item) => [item.id, item.title, item.tool, item.priority, item.status, item.reporter, item.owner, item.description, item.rootCause, item.action, item.downtime, item.startTime, item.detectionTime, item.createdAt]);
    const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const content = [columns, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eims-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Incident report exported.");
  }

  async function addIncident(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const now = new Date().toISOString();
    const incident = {
      title: String(data.get("title")).trim(),
      tool: String(data.get("tool")).trim(),
      priority: String(data.get("priority")),
      status: String(data.get("status")),
      reporter: String(data.get("reporter")).trim(),
      owner: String(data.get("owner") || "").trim(),
      description: String(data.get("description")).trim(),
      rootCause: String(data.get("rootCause") || "").trim(),
      action: String(data.get("action") || "").trim(),
      downtime: Number(data.get("downtime")) || 0,
      startTime: data.get("startTime") ? new Date(data.get("startTime")).toISOString() : now,
      detectionTime: data.get("detectionTime") ? new Date(data.get("detectionTime")).toISOString() : now
    };
    try {
      const savedIncident = await requestAPI(API_URL, {
        method: "POST",
        body: JSON.stringify(incident)
      });
      incidents.push(savedIncident);
      closeDialog();
      setView("incidents");
      $("#search-input").value = "";
      $("#status-filter").value = "";
      $("#priority-filter").value = "";
      render();
      showToast(`${savedIncident.id} has been reported and saved.`);
    } catch (error) {
      console.error("Unable to save incident.", error);
      showToast(`Incident was not saved: ${error.message}`);
    }
  }

  $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase();
  $("#tool-select").insertAdjacentHTML("beforeend", EQUIPMENT.map((code) => `<option value="${escapeHTML(code)}">${escapeHTML(code)}</option>`).join(""));
  $("#new-incident-button").addEventListener("click", openIncidentDialog);
  $("#empty-new-button").addEventListener("click", openIncidentDialog);
  $("#close-dialog").addEventListener("click", closeDialog);
  $("#cancel-dialog").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
  detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
  form.addEventListener("submit", addIncident);
  $("#advanced-toggle").addEventListener("click", () => {
    const isOpen = !$("#advanced-fields").classList.contains("hidden");
    $("#advanced-fields").classList.toggle("hidden", isOpen);
    $("#advanced-toggle").setAttribute("aria-expanded", String(!isOpen));
    $("#advanced-toggle").innerHTML = `${isOpen ? "＋ Add" : "− Hide"} investigation details <span>Optional</span>`;
  });
  $("#search-input").addEventListener("input", render);
  $("#equipment-search").addEventListener("input", renderEquipmentDirectory);
  $("#status-filter").addEventListener("change", render);
  $("#priority-filter").addEventListener("change", render);
  $("#export-button").addEventListener("click", exportCSV);
  $("#dismiss-tip").addEventListener("click", (event) => event.currentTarget.closest(".tip-card").remove());
  $("#back-to-incidents").addEventListener("click", () => setView("incidents"));
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-incident]");
    if (button) openDetails(button.dataset.openIncident);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#search-input").focus();
    }
  });
  $("#load-sample-button").addEventListener("click", async () => {
    const existingIds = new Set(incidents.map((item) => item.id));
    const additions = SAMPLE_INCIDENTS.filter((item) => !existingIds.has(item.id));
    if (!additions.length) {
      showToast("Sample incidents are already loaded.");
      return;
    }
    try {
      const saved = [];
      for (const incident of additions) {
        saved.push(await requestAPI(API_URL, {
          method: "POST",
          body: JSON.stringify(incident)
        }));
      }
      incidents = [...incidents, ...saved];
      render();
      showToast(`${saved.length} sample incidents saved to the database.`);
    } catch (error) {
      console.error("Unable to load sample incidents.", error);
      await loadIncidents();
      showToast(`Sample data was only partially saved: ${error.message}`);
    }
  });

  loadIncidents();
  window.setInterval(synchronizeIncidents, 15000);
})();
