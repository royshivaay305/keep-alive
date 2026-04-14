const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOGS = 5;
const SUCCESS_CODES = new Set([200, 206]);

const state = {
  projects: [],
};

const elements = {
  form: document.getElementById("projectForm"),
  list: document.getElementById("projectList"),
  emptyState: document.getElementById("emptyState"),
  banner: document.getElementById("banner"),
  projectCount: document.getElementById("projectCount"),
  runningCount: document.getElementById("runningCount"),
  successCount: document.getElementById("successCount"),
  startAllBtn: document.getElementById("startAllBtn"),
  stopAllBtn: document.getElementById("stopAllBtn"),
  pingAllBtn: document.getElementById("pingAllBtn"),
  template: document.getElementById("projectCardTemplate"),
};

function sanitizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function createProject(formData) {
  return {
    id: crypto.randomUUID(),
    name: formData.get("name").trim(),
    baseUrl: sanitizeBaseUrl(formData.get("url")),
    table: formData.get("table").trim(),
    apiKey: formData.get("apiKey").trim(),
    intervalDays: Number(formData.get("interval")),
    status: "idle",
    timerId: null,
    lastPingAt: null,
    lastSuccess: false,
    lastError: "",
    nextPingAt: null,
    pingHistory: [],
  };
}

function maskKey(key) {
  if (key.length <= 8) {
    return "Masked key";
  }
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function setBanner(message, tone = "default") {
  elements.banner.textContent = message;
  elements.banner.style.background =
    tone === "danger"
      ? "rgba(180, 35, 24, 0.1)"
      : tone === "ok"
        ? "rgba(21, 128, 61, 0.1)"
        : "rgba(15, 118, 110, 0.08)";
  elements.banner.style.borderColor =
    tone === "danger"
      ? "rgba(180, 35, 24, 0.2)"
      : tone === "ok"
        ? "rgba(21, 128, 61, 0.2)"
        : "rgba(15, 118, 110, 0.12)";
}

function addLog(project, entry) {
  project.pingHistory.unshift(entry);
  project.pingHistory = project.pingHistory.slice(0, MAX_LOGS);
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Not scheduled";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function describeLastResult(project) {
  if (!project.lastPingAt) {
    return "No pings yet";
  }

  if (project.lastSuccess) {
    return `Success at ${formatDateTime(project.lastPingAt)}`;
  }

  return `Failed at ${formatDateTime(project.lastPingAt)}`;
}

function updateSummary() {
  elements.projectCount.textContent = state.projects.length;
  elements.runningCount.textContent = state.projects.filter((project) => project.timerId).length;
  elements.successCount.textContent = state.projects.reduce(
    (total, project) => total + project.pingHistory.filter((entry) => entry.ok).length,
    0,
  );
}

function setStatus(project, nextStatus) {
  project.status = nextStatus;
}

function scheduleNext(project) {
  project.nextPingAt = Date.now() + project.intervalDays * DAY_MS;
}

function clearProjectTimer(project) {
  if (project.timerId) {
    clearInterval(project.timerId);
    project.timerId = null;
  }
  project.nextPingAt = null;
}

async function pingProject(project) {
  const endpoint = `${project.baseUrl}/rest/v1/${encodeURIComponent(project.table)}?limit=1`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: project.apiKey,
        Authorization: `Bearer ${project.apiKey}`,
      },
    });

    const ok = SUCCESS_CODES.has(response.status);
    project.lastPingAt = Date.now();
    project.lastSuccess = ok;
    project.lastError = ok ? "" : `HTTP ${response.status}`;
    setStatus(project, ok ? "ok" : "failed");

    addLog(project, {
      timestamp: project.lastPingAt,
      ok,
      message: ok ? `Ping OK (${response.status})` : `Ping failed (${response.status})`,
    });

    if (project.timerId) {
      scheduleNext(project);
      if (ok) {
        setStatus(project, "running");
      }
    }

    render();

    if (ok) {
      setBanner(`Last ping succeeded for ${project.name}.`, "ok");
    } else {
      setBanner(`Last ping failed for ${project.name} with ${project.lastError}.`, "danger");
    }
  } catch (error) {
    project.lastPingAt = Date.now();
    project.lastSuccess = false;
    project.lastError = error instanceof Error ? error.message : "Unknown network error";
    setStatus(project, "failed");

    addLog(project, {
      timestamp: project.lastPingAt,
      ok: false,
      message: `Ping error (${project.lastError})`,
    });

    render();
    setBanner(`Network error while pinging ${project.name}: ${project.lastError}`, "danger");
  }
}

function startProject(project) {
  if (project.timerId) {
    return;
  }

  scheduleNext(project);
  setStatus(project, "running");
  project.timerId = window.setInterval(() => {
    void pingProject(project);
  }, project.intervalDays * DAY_MS);
  render();
  setBanner(`Started keep-alive timer for ${project.name}.`);
}

function stopProject(project) {
  clearProjectTimer(project);
  setStatus(project, project.lastSuccess ? "ok" : "idle");
  render();
  setBanner(`Stopped keep-alive timer for ${project.name}.`);
}

function removeProject(projectId) {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) {
    return;
  }

  clearProjectTimer(project);
  state.projects = state.projects.filter((entry) => entry.id !== projectId);
  render();
  setBanner(`Removed ${project.name} from the dashboard.`);
}

function renderProject(project) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".project-card");
  const title = fragment.querySelector(".project-title");
  const endpoint = fragment.querySelector(".project-endpoint");
  const badge = fragment.querySelector(".status-badge");
  const table = fragment.querySelector(".project-table");
  const interval = fragment.querySelector(".project-interval");
  const nextPing = fragment.querySelector(".project-next-ping");
  const lastResult = fragment.querySelector(".project-last-result");
  const maskedKey = fragment.querySelector(".masked-key");
  const logList = fragment.querySelector(".log-list");

  card.dataset.projectId = project.id;
  title.textContent = project.name;
  endpoint.textContent = project.baseUrl;
  badge.textContent = project.status;
  badge.className = `status-badge ${project.status}`;
  table.textContent = project.table;
  interval.textContent = `Every ${project.intervalDays} day${project.intervalDays > 1 ? "s" : ""}`;
  nextPing.textContent = project.timerId ? formatDateTime(project.nextPingAt) : "Not scheduled";
  lastResult.textContent = project.lastError ? `${describeLastResult(project)} (${project.lastError})` : describeLastResult(project);
  maskedKey.textContent = maskKey(project.apiKey);

  if (project.pingHistory.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No activity recorded yet.";
    logList.appendChild(item);
  } else {
    project.pingHistory.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = `${formatDateTime(entry.timestamp)} - ${entry.message}`;
      logList.appendChild(item);
    });
  }

  return fragment;
}

function render() {
  elements.list.innerHTML = "";
  state.projects.forEach((project) => {
    elements.list.appendChild(renderProject(project));
  });

  elements.emptyState.hidden = state.projects.length > 0;
  updateSummary();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const project = createProject(formData);
  state.projects.push(project);
  elements.form.reset();
  elements.form.interval.value = "5";
  render();
  setBanner(`Added ${project.name}. Start its timer or ping it manually whenever you're ready.`);
});

elements.list.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const card = target.closest("[data-project-id]");
  if (!card) {
    return;
  }

  const project = state.projects.find((entry) => entry.id === card.dataset.projectId);
  if (!project) {
    return;
  }

  const action = target.dataset.action;

  if (action === "start") {
    startProject(project);
    return;
  }

  if (action === "stop") {
    stopProject(project);
    return;
  }

  if (action === "ping") {
    void pingProject(project);
    return;
  }

  if (action === "remove") {
    removeProject(project.id);
  }
});

elements.startAllBtn.addEventListener("click", () => {
  state.projects.forEach((project) => startProject(project));
  if (state.projects.length > 0) {
    setBanner("Started timers for all registered projects.");
  }
});

elements.stopAllBtn.addEventListener("click", () => {
  state.projects.forEach((project) => stopProject(project));
  if (state.projects.length > 0) {
    setBanner("Stopped timers for all registered projects.");
  }
});

elements.pingAllBtn.addEventListener("click", () => {
  state.projects.forEach((project) => {
    void pingProject(project);
  });
  if (state.projects.length > 0) {
    setBanner("Triggered a manual ping for every project.");
  }
});

render();
