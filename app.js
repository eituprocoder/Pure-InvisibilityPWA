"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  active: false,
  durationSeconds: 15 * 60,
  remainingSeconds: 15 * 60,
  startedAt: null,
  endsAt: null,
  timerId: null,
  connectionChanges: 0,
  startedOnline: navigator.onLine,
  wentOnlineDuringSession: false,
  deferredInstallPrompt: null,
  storage: "localStorage"
};

const els = {
  connectionPill: $("#connectionPill"), browserConnection: $("#browserConnection"),
  connectionChanges: $("#connectionChanges"), lastNetworkChange: $("#lastNetworkChange"),
  appNetworkAccess: $("#appNetworkAccess"), onlineWarning: $("#onlineWarning"),
  durationRange: $("#durationRange"), durationValue: $("#durationValue"),
  durationControl: $("#durationControl"), timerDisplay: $("#timerDisplay"),
  timerSubtext: $("#timerSubtext"), timerRing: $("#timerRing"), modeBadge: $("#modeBadge"),
  activateButton: $("#activateButton"), emergencyButton: $("#emergencyButton"),
  activeControls: $("#activeControls"), reportPanel: $("#reportPanel"),
  reportSummary: $("#reportSummary"), reportMetrics: $("#reportMetrics"),
  historyEmpty: $("#historyEmpty"), historyTable: $("#historyTable"),
  simulatorStage: $("#simulatorStage"), simulatorTitle: $("#simulatorTitle"),
  simulatorText: $("#simulatorText"), simulationOutput: $("#simulationOutput"),
  installButton: $("#installButton"), toast: $("#toast")
};

const HISTORY_KEY = "pure-invisibility-history-v1";
const ACTIVE_SESSION_KEY = "pure-invisibility-active-session-v1";
const DB_NAME = "pure-invisibility-db";
const STORE_NAME = "events";

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.remove("show"), 4200);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function logEvent(type, detail = {}) {
  const record = { type, detail, timestamp: new Date().toISOString(), sessionStart: state.startedAt };
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).add(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    state.storage = "IndexedDB";
  } catch {
    const fallback = JSON.parse(localStorage.getItem("pure-invisibility-events") || "[]");
    fallback.push(record);
    localStorage.setItem("pure-invisibility-events", JSON.stringify(fallback.slice(-300)));
    state.storage = "localStorage";
  }
}

function updateNetworkStatus(fromEvent = false) {
  const online = navigator.onLine;
  els.connectionPill.className = `status-pill ${online ? "online" : "offline"}`;
  els.connectionPill.lastElementChild.textContent = online ? "ONLINE" : "SECURE OFFLINE";
  els.browserConnection.textContent = online ? "ONLINE" : "OFFLINE";
  els.browserConnection.className = online ? "value-online" : "value-offline";

  if (fromEvent) {
    state.connectionChanges += 1;
    els.connectionChanges.textContent = String(state.connectionChanges);
    els.lastNetworkChange.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logEvent(online ? "connection-online" : "connection-offline");
    if (state.active) {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
        startedAt: state.startedAt,
        endsAt: state.endsAt,
        durationSeconds: state.durationSeconds,
        startedOnline: state.startedOnline,
        connectionChanges: state.connectionChanges,
        wentOnlineDuringSession: state.wentOnlineDuringSession || online
      }));
    }
  }

  if (state.active && online && fromEvent) {
    state.wentOnlineDuringSession = true;
    els.onlineWarning.hidden = false;
    showToast("Conexión detectada: el dispositivo volvió a estar online. El bloqueo interno de esta PWA continúa.");
  }
  calculateReadiness();
}

async function sendIsolationState(active, expiresAt = null) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const worker = navigator.serviceWorker.controller || registration?.active;
  worker?.postMessage({ type: "SET_ISOLATION", active, expiresAt });
}

function setControlsActive(active) {
  $$("#activeControls > div").forEach((row) => {
    row.querySelector(".control-light").className = `control-light ${active ? "active" : "standby"}`;
    row.querySelector("b").className = active ? "active" : "";
    row.querySelector("b").textContent = active ? "ACTIVE" : "STANDBY";
  });
  const requestItem = $('[data-feature="requests"]');
  requestItem.classList.toggle("active", active);
  requestItem.querySelector("span").textContent = active ? "✓" : "○";
  els.appNetworkAccess.textContent = active ? "LOCKED TO APP SHELL" : "Available";
  els.appNetworkAccess.className = active ? "value-secure" : "";
}

function updateTimer() {
  els.timerDisplay.textContent = formatTime(state.remainingSeconds);
  const completed = state.durationSeconds ? (state.durationSeconds - state.remainingSeconds) / state.durationSeconds : 0;
  els.timerRing.style.setProperty("--progress", Math.min(100, Math.max(0, completed * 100)).toFixed(2));
}

async function startSession() {
  if (state.active) return;
  state.active = true;
  state.durationSeconds = Number(els.durationRange.value) * 60;
  state.remainingSeconds = state.durationSeconds;
  state.startedAt = new Date().toISOString();
  state.endsAt = Date.now() + state.durationSeconds * 1000;
  state.startedOnline = navigator.onLine;
  state.connectionChanges = 0;
  state.wentOnlineDuringSession = false;
  els.connectionChanges.textContent = "0";
  els.lastNetworkChange.textContent = "—";
  els.onlineWarning.hidden = true;
  els.reportPanel.hidden = true;
  els.durationControl.hidden = true;
  els.activateButton.hidden = true;
  els.emergencyButton.hidden = false;
  els.timerSubtext.textContent = "Isolation active";
  els.timerRing.classList.add("active");
  els.modeBadge.className = "mode-badge active";
  els.modeBadge.lastElementChild.textContent = "ISOLATION ACTIVE";
  setControlsActive(true);
  updateTimer();
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    durationSeconds: state.durationSeconds,
    startedOnline: state.startedOnline,
    connectionChanges: 0,
    wentOnlineDuringSession: false
  }));
  await sendIsolationState(true, state.endsAt);
  await logEvent("session-start", { durationSeconds: state.durationSeconds, online: state.startedOnline });

  state.timerId = setInterval(() => {
    state.remainingSeconds = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    updateTimer();
    sendIsolationState(true, state.endsAt);
    if (state.remainingSeconds <= 0) endSession("timer-complete");
  }, 1000);
}

async function endSession(reason = "manual") {
  if (!state.active) return;
  clearInterval(state.timerId);
  const endedAt = new Date();
  const elapsedSeconds = Math.max(1, Math.round((endedAt - new Date(state.startedAt)) / 1000));
  state.active = false;
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  state.remainingSeconds = 0;
  updateTimer();
  await sendIsolationState(false);
  setControlsActive(false);
  els.durationControl.hidden = false;
  els.activateButton.hidden = false;
  els.emergencyButton.hidden = true;
  els.timerRing.classList.remove("active");
  els.timerSubtext.textContent = "Session complete";
  els.modeBadge.className = "mode-badge complete";
  els.modeBadge.lastElementChild.textContent = "SESSION COMPLETE";
  els.onlineWarning.hidden = true;

  const session = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    startedAt: state.startedAt,
    endedAt: endedAt.toISOString(),
    plannedSeconds: state.durationSeconds,
    elapsedSeconds,
    connectionChanges: state.connectionChanges,
    startedOnline: state.startedOnline,
    wentOnlineDuringSession: state.wentOnlineDuringSession,
    reason
  };
  saveSession(session);
  await logEvent("session-end", session);
  showReport(session);
  renderHistory();
  showToast(reason === "timer-complete" ? "Sesión completada y controles restaurados." : "Sesión finalizada; la PWA restauró su funcionamiento normal.");
}

async function resumeSessionIfNeeded() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null"); } catch { saved = null; }
  if (!saved) return;
  if (!Number.isFinite(saved.endsAt) || saved.endsAt <= Date.now()) {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    await sendIsolationState(false);
    return;
  }
  state.active = true;
  state.startedAt = saved.startedAt;
  state.endsAt = saved.endsAt;
  state.durationSeconds = saved.durationSeconds;
  state.remainingSeconds = Math.ceil((saved.endsAt - Date.now()) / 1000);
  state.startedOnline = Boolean(saved.startedOnline);
  state.connectionChanges = Number(saved.connectionChanges) || 0;
  state.wentOnlineDuringSession = Boolean(saved.wentOnlineDuringSession);
  els.connectionChanges.textContent = String(state.connectionChanges);
  els.durationControl.hidden = true;
  els.activateButton.hidden = true;
  els.emergencyButton.hidden = false;
  els.timerSubtext.textContent = "Isolation active · resumed";
  els.timerRing.classList.add("active");
  els.modeBadge.className = "mode-badge active";
  els.modeBadge.lastElementChild.textContent = "ISOLATION ACTIVE";
  setControlsActive(true);
  updateTimer();
  await sendIsolationState(true, state.endsAt);
  state.timerId = setInterval(() => {
    state.remainingSeconds = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
    updateTimer();
    sendIsolationState(true, state.endsAt);
    if (state.remainingSeconds <= 0) endSession("timer-complete");
  }, 1000);
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function saveSession(session) {
  const history = getHistory();
  history.unshift(session);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

function showReport(session) {
  const completed = session.reason === "timer-complete";
  const offlineMessage = session.connectionChanges === 0 ? "No se detectaron cambios de conexión." : `Se detectaron ${session.connectionChanges} cambios de conexión.`;
  els.reportSummary.textContent = `${completed ? "El temporizador finalizó correctamente." : "La sesión fue finalizada con el botón de emergencia."} ${offlineMessage} Los controles internos se restauraron automáticamente.`;
  els.reportMetrics.innerHTML = [
    `Elapsed: ${formatTime(session.elapsedSeconds)}`,
    `Started: ${session.startedOnline ? "online" : "offline"}`,
    `Network changes: ${session.connectionChanges}`,
    `Storage: ${state.storage}`
  ].map((item) => `<span>${item}</span>`).join("");
  els.reportPanel.hidden = false;
  els.reportPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderHistory() {
  const history = getHistory();
  els.historyEmpty.hidden = history.length > 0;
  els.historyTable.hidden = history.length === 0;
  const tbody = els.historyTable.querySelector("tbody");
  tbody.innerHTML = "";
  history.forEach((session) => {
    const row = document.createElement("tr");
    const result = session.reason === "timer-complete" ? "Complete" : "Ended early";
    row.innerHTML = `<td>${new Date(session.startedAt).toLocaleString()}</td><td>${formatTime(session.elapsedSeconds)}</td><td>${session.connectionChanges}</td><td>${result}</td><td><button class="button" data-report-id="${session.id}">View</button></td>`;
    tbody.appendChild(row);
  });
}

async function calculateReadiness() {
  let cacheReady = false;
  if ("caches" in window) {
    try { cacheReady = await caches.has("pure-invisibility-shell-v1"); } catch { cacheReady = false; }
  }
  const checks = [
    { label: "Service Worker API", points: 25, pass: "serviceWorker" in navigator },
    { label: "Active SW controller", points: 25, pass: Boolean(navigator.serviceWorker?.controller) },
    { label: "App shell cached", points: 20, pass: cacheReady },
    { label: "Local storage", points: 15, pass: (() => { try { localStorage.setItem("pi-test", "1"); localStorage.removeItem("pi-test"); return true; } catch { return false; } })() },
    { label: "Currently offline", points: 15, pass: !navigator.onLine }
  ];
  const score = checks.reduce((sum, check) => sum + (check.pass ? check.points : 0), 0);
  $("#scoreValue").textContent = String(score);
  $("#scoreGauge").style.setProperty("--score", score);
  $("#scoreDetails").innerHTML = checks.map((check) => `<div><span>${check.label}</span><b class="${check.pass ? "pass" : "pending"}">${check.pass ? `+${check.points}` : "0"}</b></div>`).join("");
}

async function runSimulation() {
  const button = $("#runSimulation");
  button.disabled = true;
  els.simulationOutput.textContent = "Simulation: observing connection loss… no network call is being made.";
  els.simulatorStage.className = "sim-stage offline";
  els.simulatorTitle.textContent = "Connection unavailable";
  els.simulatorText.textContent = "La interfaz sigue activa con contenido local; las funciones de red quedan pausadas.";
  await new Promise((resolve) => setTimeout(resolve, 1600));
  els.simulationOutput.textContent = "Result: app shell available, local data readable, network-only actions disabled. Educational Simulation complete.";
  await logEvent("simulation-complete");
  setTimeout(() => {
    els.simulatorStage.className = "sim-stage online";
    els.simulatorTitle.textContent = "Connected application";
    els.simulatorText.textContent = "Contenido local disponible; funciones de red habilitadas.";
    button.disabled = false;
  }, 2800);
}

async function testInternalRequest() {
  els.simulationOutput.textContent = "Testing a same-origin synthetic endpoint…";
  try {
    const response = await fetch("./__pure-invisibility-network-test__", { cache: "no-store" });
    const data = await response.json();
    els.simulationOutput.textContent = `${data.status}: ${data.message}`;
  } catch {
    els.simulationOutput.textContent = "Test unavailable until the Service Worker controls this page. Reload once after installation.";
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return calculateReadiness();
  try {
    await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    await navigator.serviceWorker.ready;
    calculateReadiness();
  } catch (error) {
    console.warn("Service Worker registration failed:", error);
    calculateReadiness();
  }
}

els.durationRange.addEventListener("input", () => {
  const minutes = Number(els.durationRange.value);
  state.durationSeconds = minutes * 60;
  state.remainingSeconds = state.durationSeconds;
  els.durationValue.textContent = `${minutes} min`;
  $$(".quick-times button").forEach((button) => button.classList.toggle("selected", Number(button.dataset.minutes) === minutes));
  updateTimer();
});

$$(".quick-times button").forEach((button) => button.addEventListener("click", () => {
  els.durationRange.value = button.dataset.minutes;
  els.durationRange.dispatchEvent(new Event("input"));
}));

els.activateButton.addEventListener("click", startSession);
els.emergencyButton.addEventListener("click", () => endSession("manual"));
$("#runSimulation").addEventListener("click", runSimulation);
$("#testInternalRequest").addEventListener("click", testInternalRequest);
$("#clearHistory").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast("Historial local eliminado.");
});

els.historyTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-id]");
  if (!button) return;
  const session = getHistory().find((item) => item.id === button.dataset.reportId);
  if (session) showReport(session);
});

window.addEventListener("online", () => updateNetworkStatus(true));
window.addEventListener("offline", () => updateNetworkStatus(true));
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  els.installButton.hidden = false;
});
els.installButton.addEventListener("click", async () => {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  els.installButton.hidden = true;
});
window.addEventListener("appinstalled", () => showToast("Pure Invisibility se instaló correctamente."));

updateNetworkStatus();
updateTimer();
renderHistory();
registerServiceWorker().then(resumeSessionIfNeeded);
logEvent("app-open", { online: navigator.onLine });
