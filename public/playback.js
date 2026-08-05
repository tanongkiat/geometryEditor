const loadFilesBtn = document.getElementById("loadFilesBtn");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const stepList = document.getElementById("stepList");
const emptySteps = document.getElementById("emptySteps");
const stepCountBadge = document.getElementById("stepCountBadge");
const stepCounter = document.getElementById("stepCounter");
const currentFileName = document.getElementById("currentFileName");
const summary = document.getElementById("summary");
const playbackViewport = document.getElementById("playbackViewport");
const viewportEmpty = document.getElementById("viewportEmpty");
const stepSlider = document.getElementById("stepSlider");
const sliderEnd = document.getElementById("sliderEnd");
const firstBtn = document.getElementById("firstBtn");
const previousBtn = document.getElementById("previousBtn");
const playBtn = document.getElementById("playBtn");
const nextBtn = document.getElementById("nextBtn");
const lastBtn = document.getElementById("lastBtn");
const speedSelect = document.getElementById("speedSelect");
const cumulativeToggle = document.getElementById("cumulativeToggle");
const statusText = document.getElementById("statusText");
const stepNote = document.getElementById("stepNote");

const state = {
  steps: [],
  currentIndex: -1,
  playing: false,
  playTimer: null,
  renderToken: 0
};

const SESSIONS_STORAGE_KEY = "geometry-playback-sessions";
const CURRENT_STORAGE_KEY = "geometry-playback-current";

let saveCurrentTimeout = null;

const saveSessionBtn = document.getElementById("saveSessionBtn");
const openSessionBtn = document.getElementById("openSessionBtn");
const sessionDialog = document.getElementById("sessionDialog");
const sessionDialogTitle = document.getElementById("sessionDialogTitle");
const sessionDialogBody = document.getElementById("sessionDialogBody");
const closeSessionDialog = document.getElementById("closeSessionDialog");
const exportSessionBtn = document.getElementById("exportSessionBtn");
const importSessionBtn = document.getElementById("importSessionBtn");
const importFileInput = document.getElementById("importFileInput");

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("is-error", isError);
}

function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function isMarkupFile(file) {
  return file && (file.name.toLowerCase().endsWith(".txt") || file.type === "text/plain");
}

function updateTransport() {
  const hasSteps = state.steps.length > 0;
  const atStart = !hasSteps || state.currentIndex <= 0;
  const atEnd = !hasSteps || state.currentIndex >= state.steps.length - 1;

  firstBtn.disabled = atStart;
  previousBtn.disabled = atStart;
  nextBtn.disabled = atEnd;
  lastBtn.disabled = atEnd;
  playBtn.disabled = !hasSteps || state.steps.length < 2;
  stepSlider.disabled = !hasSteps || state.steps.length < 2;
  stepSlider.max = String(Math.max(0, state.steps.length - 1));
  stepSlider.value = String(Math.max(0, state.currentIndex));
  sliderEnd.textContent = String(state.steps.length);
  playBtn.querySelector(".play-icon").textContent = state.playing ? "❚❚" : "▶";
  playBtn.querySelector(".play-label").textContent = state.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
}

function renderStepList() {
  stepList.replaceChildren();
  emptySteps.hidden = state.steps.length > 0;
  stepCountBadge.textContent = String(state.steps.length);

  state.steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = `step-item${index === state.currentIndex ? " is-current" : ""}`;
    item.dataset.index = String(index);
    if (index === state.currentIndex) item.setAttribute("aria-current", "step");

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "step-select";
    selectButton.dataset.action = "select";
    selectButton.title = `Show ${step.name}`;

    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = `Step ${index + 1}`;
    const name = document.createElement("span");
    name.className = "step-name";
    name.textContent = step.name;
    selectButton.append(number, name);
    if (step.note?.trim()) {
      const noteIndicator = document.createElement("span");
      noteIndicator.className = "step-note-indicator";
      noteIndicator.textContent = "Note";
      noteIndicator.title = "This step has an explanation";
      selectButton.append(noteIndicator);
    }

    const actions = document.createElement("div");
    actions.className = "step-actions";
    const up = document.createElement("button");
    up.type = "button";
    up.dataset.action = "up";
    up.textContent = "↑";
    up.title = "Move step earlier";
    up.setAttribute("aria-label", `Move ${step.name} earlier`);
    up.disabled = index === 0;
    const down = document.createElement("button");
    down.type = "button";
    down.dataset.action = "down";
    down.textContent = "↓";
    down.title = "Move step later";
    down.setAttribute("aria-label", `Move ${step.name} later`);
    down.disabled = index === state.steps.length - 1;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-step";
    remove.dataset.action = "remove";
    remove.textContent = "×";
    remove.title = "Remove step";
    remove.setAttribute("aria-label", `Remove ${step.name}`);
    actions.append(up, down, remove);
    item.append(selectButton, actions);
    stepList.append(item);
  });
}

function markupForCurrentStep() {
  if (state.currentIndex < 0) return "";
  if (!cumulativeToggle.checked) return state.steps[state.currentIndex].markup;
  return state.steps
    .slice(0, state.currentIndex + 1)
    .map((step) => step.markup.trim())
    .filter(Boolean)
    .join("\n");
}

function showEmptyViewport() {
  playbackViewport.replaceChildren(viewportEmpty);
  stepCounter.textContent = "No steps loaded";
  currentFileName.textContent = "Load markup files to begin";
  summary.textContent = "";
  stepNote.value = "";
}

async function renderCurrentStep() {
  if (state.currentIndex < 0 || !state.steps[state.currentIndex]) {
    showEmptyViewport();
    updateTransport();
    return;
  }

  const token = ++state.renderToken;
  const step = state.steps[state.currentIndex];
  stepNote.value = step.note || "";
  stepCounter.textContent = `Step ${state.currentIndex + 1} of ${state.steps.length}`;
  currentFileName.textContent = step.name;
  summary.textContent = "Rendering…";
  renderStepList();
  updateTransport();

  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markup: markupForCurrentStep(),
        width: 1100,
        height: 700,
        padding: 0,
        fixedViewport: true
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Render failed (${response.status}).`);
    }
    if (token !== state.renderToken) return;

    playbackViewport.innerHTML = payload.svg;
    const total = Number(payload.summary?.total || payload.items?.length || 0);
    summary.textContent = `${total} item${total === 1 ? "" : "s"}${cumulativeToggle.checked ? " · cumulative" : ""}`;
    setStatus(`Showing step ${state.currentIndex + 1}: ${step.name}.`);
  } catch (error) {
    if (token !== state.renderToken) return;
    playbackViewport.replaceChildren();
    const errorMessage = document.createElement("div");
    errorMessage.className = "viewport-empty";
    errorMessage.textContent = "This step could not be rendered.";
    playbackViewport.append(errorMessage);
    summary.textContent = "Render error";
    setStatus(error.message, true);
    stopPlayback();
  }
}

function setCurrentStep(index) {
  if (state.steps.length === 0) return;
  state.currentIndex = Math.max(0, Math.min(state.steps.length - 1, Number(index)));
  renderCurrentStep();
}

function stopPlayback() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  state.playing = false;
  updateTransport();
}

function startPlayback() {
  if (state.steps.length < 2) return;
  if (state.currentIndex >= state.steps.length - 1) {
    setCurrentStep(0);
  }
  state.playing = true;
  state.playTimer = window.setInterval(() => {
    if (state.currentIndex >= state.steps.length - 1) {
      stopPlayback();
      setStatus("Playback finished.");
      return;
    }
    setCurrentStep(state.currentIndex + 1);
  }, Number(speedSelect.value));
  updateTransport();
  setStatus("Playback started.");
}

function togglePlayback() {
  if (state.playing) {
    stopPlayback();
    setStatus("Playback paused.");
  } else {
    startPlayback();
  }
}

async function loadMarkupFiles(fileList) {
  const files = Array.from(fileList || []).filter(isMarkupFile);
  if (files.length === 0) {
    setStatus("Choose one or more .txt markup files.", true);
    return;
  }

  stopPlayback();
  setStatus(`Loading ${files.length} file${files.length === 1 ? "" : "s"}…`);
  try {
    const steps = await Promise.all(files.map(async (file) => ({
      name: file.name,
      markup: await file.text(),
      note: ""
    })));
    steps.sort((left, right) => naturalCompare(left.name, right.name));
    state.steps = steps;
    state.currentIndex = 0;
    renderStepList();
    updateTransport();
    saveCurrentPlayback();
    await renderCurrentStep();
    setStatus(`Loaded ${steps.length} playback step${steps.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setStatus(`Could not load the selected files: ${error.message}`, true);
  } finally {
    fileInput.value = "";
  }
}

function moveStep(index, direction) {
  const destination = index + direction;
  if (destination < 0 || destination >= state.steps.length) return;
  stopPlayback();
  const currentStep = state.steps[state.currentIndex];
  [state.steps[index], state.steps[destination]] = [state.steps[destination], state.steps[index]];
  state.currentIndex = state.steps.indexOf(currentStep);
  renderStepList();
  saveCurrentPlayback();
  renderCurrentStep();
  setStatus("Playback order updated.");
}

function removeStep(index) {
  if (!state.steps[index]) return;
  stopPlayback();
  const removed = state.steps.splice(index, 1)[0];
  if (state.steps.length === 0) {
    state.currentIndex = -1;
    renderStepList();
    showEmptyViewport();
    updateTransport();
    saveCurrentPlayback();
  } else {
    if (index < state.currentIndex) state.currentIndex -= 1;
    state.currentIndex = Math.min(state.currentIndex, state.steps.length - 1);
    saveCurrentPlayback();
    renderCurrentStep();
  }
  setStatus(`Removed ${removed.name}.`);
}

loadFilesBtn.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => loadMarkupFiles(fileInput.files));

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
}

dropZone.addEventListener("drop", (event) => loadMarkupFiles(event.dataTransfer?.files));

stepList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const item = button?.closest(".step-item");
  if (!button || !item) return;
  const index = Number(item.dataset.index);
  const action = button.dataset.action;
  if (action === "select") {
    stopPlayback();
    setCurrentStep(index);
  } else if (action === "up") {
    moveStep(index, -1);
  } else if (action === "down") {
    moveStep(index, 1);
  } else if (action === "remove") {
    removeStep(index);
  }
});

firstBtn.addEventListener("click", () => {
  stopPlayback();
  setCurrentStep(0);
});
previousBtn.addEventListener("click", () => {
  stopPlayback();
  setCurrentStep(state.currentIndex - 1);
});
playBtn.addEventListener("click", togglePlayback);
nextBtn.addEventListener("click", () => {
  stopPlayback();
  setCurrentStep(state.currentIndex + 1);
});
lastBtn.addEventListener("click", () => {
  stopPlayback();
  setCurrentStep(state.steps.length - 1);
});
stepSlider.addEventListener("input", () => {
  stopPlayback();
  setCurrentStep(Number(stepSlider.value));
});
speedSelect.addEventListener("change", () => {
  saveCurrentPlayback();
  if (state.playing) {
    stopPlayback();
    startPlayback();
  }
});
cumulativeToggle.addEventListener("change", () => {
  stopPlayback();
  saveCurrentPlayback();
  renderCurrentStep();
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) {
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    stopPlayback();
    setCurrentStep(state.currentIndex - 1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    stopPlayback();
    setCurrentStep(state.currentIndex + 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    stopPlayback();
    setCurrentStep(0);
  } else if (event.key === "End") {
    event.preventDefault();
    stopPlayback();
    setCurrentStep(state.steps.length - 1);
  } else if (event.key === " " && state.steps.length > 1) {
    event.preventDefault();
    togglePlayback();
  }
});

function getSavedSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setSavedSessions(sessions) {
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sessionPayload() {
  return {
    steps: state.steps.map((step) => ({ name: step.name, markup: step.markup, note: step.note || "" })),
    currentIndex: state.currentIndex,
    cumulative: cumulativeToggle.checked,
    speed: speedSelect.value
  };
}

function saveCurrentPlayback() {
  if (state.steps.length === 0) {
    localStorage.removeItem(CURRENT_STORAGE_KEY);
    return;
  }
  try {
    localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      ...sessionPayload()
    }));
  } catch (error) {
    // Storage may be full; fail silently so the UI keeps working.
  }
}

function scheduleSaveCurrentPlayback() {
  if (saveCurrentTimeout) window.clearTimeout(saveCurrentTimeout);
  saveCurrentTimeout = window.setTimeout(saveCurrentPlayback, 300);
}

function loadCurrentPlayback() {
  try {
    const raw = localStorage.getItem(CURRENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreCurrentPlayback() {
  const payload = loadCurrentPlayback();
  if (!payload || !Array.isArray(payload.steps) || payload.steps.length === 0) return;

  stopPlayback();
  state.steps = payload.steps.map((step) => ({
    name: step.name || "Untitled step",
    markup: step.markup || "",
    note: step.note || ""
  }));
  state.currentIndex = typeof payload.currentIndex === "number" ? payload.currentIndex : 0;
  state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.steps.length - 1));
  cumulativeToggle.checked = Boolean(payload.cumulative);
  if (payload.speed) speedSelect.value = String(payload.speed);

  renderStepList();
  updateTransport();
  renderCurrentStep();
  setStatus("Restored your last playback session.");
}

function savePlaybackSession() {
  if (state.steps.length === 0) {
    setStatus("Load markup files before saving a playback.", true);
    return;
  }

  const defaultName = state.steps[0]
    ? `Playback ${formatDateTime(Date.now())}`
    : `Playback ${Date.now()}`;
  const name = window.prompt("Name this playback:", defaultName);
  if (!name || !name.trim()) return;

  const sessions = getSavedSessions();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    sessions.unshift({
      id,
      name: name.trim(),
      createdAt: Date.now(),
      payload: sessionPayload()
    });
    setSavedSessions(sessions);    saveCurrentPlayback();    setStatus(`Saved playback "${name.trim()}".`);
  } catch (error) {
    setStatus(`Could not save playback: ${error.message}`, true);
  }
}

function deleteSession(id) {
  const sessions = getSavedSessions().filter((session) => session.id !== id);
  setSavedSessions(sessions);
  renderSessionDialog();
}

function loadSession(id) {
  const session = getSavedSessions().find((entry) => entry.id === id);
  if (!session || !session.payload) return;

  stopPlayback();
  state.steps = (session.payload.steps || []).map((step) => ({
    name: step.name,
    markup: step.markup,
    note: step.note || ""
  }));
  state.currentIndex = typeof session.payload.currentIndex === "number" ? session.payload.currentIndex : 0;
  cumulativeToggle.checked = Boolean(session.payload.cumulative);
  if (session.payload.speed) speedSelect.value = String(session.payload.speed);

  sessionDialog.close();
  if (state.steps.length === 0) {
    showEmptyViewport();
    renderStepList();
    updateTransport();
    setStatus("Opened saved playback, but it contains no steps.", true);
  } else {
    state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.steps.length - 1));
    renderStepList();
    updateTransport();
    renderCurrentStep();
    setStatus(`Opened saved playback "${session.name}".`);
  }
}

function renderSessionDialog() {
  const sessions = getSavedSessions();

  if (sessions.length === 0) {
    sessionDialogBody.innerHTML = '<p class="session-empty">No saved playbacks yet.</p>';
    return;
  }

  const list = document.createElement("ol");
  list.className = "session-list";

  sessions.forEach((session) => {
    const item = document.createElement("li");
    item.className = "session-item";

    const info = document.createElement("div");
    info.className = "session-item-info";

    const name = document.createElement("span");
    name.className = "session-item-name";
    name.textContent = session.name;

    const meta = document.createElement("span");
    meta.className = "session-item-meta";
    meta.textContent = `${session.payload?.steps?.length || 0} steps · ${formatDateTime(session.createdAt)}`;

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "session-item-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "Open";
    loadButton.addEventListener("click", () => loadSession(session.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteSession(session.id));

    actions.append(loadButton, deleteButton);
    item.append(info, actions);
    list.append(item);
  });

  sessionDialogBody.replaceChildren(list);
}

function openPlaybackSessionsDialog() {
  renderSessionDialog();
  sessionDialog.showModal();
}

stepNote.addEventListener("input", () => {
  if (state.currentIndex >= 0 && state.steps[state.currentIndex]) {
    state.steps[state.currentIndex].note = stepNote.value;
    scheduleSaveCurrentPlayback();
  }
});

function exportPlaybackSession() {
  if (state.steps.length === 0) {
    setStatus("Load markup files before exporting a playback.", true);
    return;
  }

  const defaultName = `playback-${new Date().toISOString().slice(0, 10)}.json`;
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    ...sessionPayload()
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Playback exported.");
}

async function importPlaybackSession(fileList) {
  const file = Array.from(fileList || [])[0];
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || !Array.isArray(payload.steps)) {
      throw new Error("Invalid playback file.");
    }

    stopPlayback();
    state.steps = payload.steps.map((step) => ({
      name: step.name || "Untitled step",
      markup: step.markup || "",
      note: step.note || ""
    }));
    state.currentIndex = typeof payload.currentIndex === "number" ? payload.currentIndex : 0;
    cumulativeToggle.checked = Boolean(payload.cumulative);
    if (payload.speed) speedSelect.value = String(payload.speed);

    if (state.steps.length === 0) {
      showEmptyViewport();
      renderStepList();
      updateTransport();
      setStatus("Imported playback contains no steps.", true);
    } else {
      state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.steps.length - 1));
      renderStepList();
      updateTransport();
      renderCurrentStep();
      setStatus("Playback imported.");
    }
  } catch (error) {
    setStatus(`Could not import playback: ${error.message}`, true);
  } finally {
    importFileInput.value = "";
  }
}

saveSessionBtn.addEventListener("click", savePlaybackSession);
openSessionBtn.addEventListener("click", openPlaybackSessionsDialog);
exportSessionBtn.addEventListener("click", exportPlaybackSession);
importSessionBtn.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => importPlaybackSession(importFileInput.files));
closeSessionDialog.addEventListener("click", () => sessionDialog.close());
sessionDialog.addEventListener("click", (event) => {
  if (event.target === sessionDialog) sessionDialog.close();
});

showEmptyViewport();
renderStepList();
updateTransport();
restoreCurrentPlayback();
