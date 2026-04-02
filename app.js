const DB_NAME = "giornale-cantiere-db";
const DB_VERSION = 2;
let db;
let selectedJobId = null;
let pendingPhotos = [];
let pendingTaskPhotos = [];
const DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", { dateStyle: "short" });

const views = {
  jobs: document.getElementById("jobs-view"),
  detail: document.getElementById("job-detail-view")
};

const SUBMENU_SECTIONS = [
  { key: "panoramica", label: "Panoramica", panelId: "panel-panoramica" },
  { key: "giornale", label: "Giornale cantiere", panelId: "panel-giornale" },
  { key: "presenze", label: "Presenze", panelId: "panel-presenze", quickField: "operators" },
  { key: "lavori", label: "Lavori eseguiti", panelId: "panel-lavori", quickField: "workDescription" },
  { key: "mezzi", label: "Mezzi e attrezzature", panelId: "panel-mezzi", quickField: "equipment" },
  { key: "materiali", label: "Materiali", panelId: "panel-materiali", quickField: "materials" },
  { key: "problemi", label: "Problemi / anomalie", panelId: "panel-problemi", quickField: "issues" },
  { key: "foto", label: "Foto", panelId: "panel-foto" },
  { key: "note", label: "Note finali", panelId: "panel-note", quickField: "finalNotes" }
];

const jobsList = document.getElementById("jobs-list");
const entriesList = document.getElementById("entries-list");
const jobMainData = document.getElementById("job-main-data");
const jobSearch = document.getElementById("job-search");
const jobSubmenu = document.getElementById("job-submenu");
const entryForm = document.getElementById("entry-form");
const panels = Object.fromEntries(SUBMENU_SECTIONS.map((s) => [s.key, document.getElementById(s.panelId)]));

const dialogs = {
  job: document.getElementById("job-dialog"),
  entry: document.getElementById("entry-dialog"),
  task: document.getElementById("task-dialog"),
  taskCompletion: document.getElementById("task-completion-dialog")
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("jobs")) {
        const jobs = d.createObjectStore("jobs", { keyPath: "id", autoIncrement: true });
        jobs.createIndex("name", "name");
      }
      if (!d.objectStoreNames.contains("entries")) {
        const entries = d.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
        entries.createIndex("jobId", "jobId");
        entries.createIndex("date", "date");
        entries.createIndex("createdAt", "createdAt");
      }
      if (!d.objectStoreNames.contains("tasks")) {
        const tasks = d.createObjectStore("tasks", { keyPath: "id", autoIncrement: true });
        tasks.createIndex("jobId", "jobId");
        tasks.createIndex("status", "status");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
}

function showSubmenuSection(sectionKey) {
  SUBMENU_SECTIONS.forEach((section) => {
    const button = document.querySelector(`[data-section="${section.key}"]`);
    const panel = panels[section.key];
    const isActive = section.key === sectionKey;

    if (button) button.classList.toggle("active", isActive);
    if (panel) panel.classList.toggle("active", isActive);
  });
}

function add(store, data) {
  return new Promise((resolve, reject) => {
    const req = tx(store, "readwrite").add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function put(store, data) {
  return new Promise((resolve, reject) => {
    const req = tx(store, "readwrite").put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const req = tx(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "Data non specificata";
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dateStr : DATE_FORMATTER.format(date);
}

function getGroupDateKey(entry) {
  if (entry.date) return entry.date;
  if (entry.createdAt) return entry.createdAt.slice(0, 10);
  return "0000-00-00";
}

function resetEntryDialog() {
  pendingPhotos = [];
  document.getElementById("photo-preview").innerHTML = "";
  document.getElementById("photo-input").value = "";
  entryForm.reset();
}

function openEntryDialog(focusField) {
  if (!selectedJobId) return;
  resetEntryDialog();
  entryForm.date.value = new Date().toISOString().slice(0, 10);
  dialogs.entry.showModal();
  if (focusField && entryForm[focusField]) {
    setTimeout(() => entryForm[focusField].focus(), 50);
  }
}

async function renderJobs(filter = "") {
  const jobs = await getAll("jobs");
  const normalized = filter.trim().toLowerCase();
  const filtered = normalized
    ? jobs.filter((j) => `${j.name} ${j.code || ""} ${j.client || ""}`.toLowerCase().includes(normalized))
    : jobs;

  jobsList.innerHTML = filtered.length
    ? filtered
        .map(
          (j) => `
      <article class="job-item" data-id="${j.id}">
        <h3>${escapeHtml(j.name)}</h3>
        <p class="meta">${escapeHtml(j.code || "Nessun codice")} • ${escapeHtml(j.client || "Cliente non indicato")}</p>
      </article>
    `
        )
        .join("")
    : `<div class="card">Nessuna commessa presente.</div>`;

  [...jobsList.querySelectorAll(".job-item")].forEach((item) => {
    item.addEventListener("click", () => openJobDetail(Number(item.dataset.id)));
  });
}

function buildSubmenu() {
  jobSubmenu.innerHTML = SUBMENU_SECTIONS.map((section) => `<button class="submenu-btn" data-section="${section.key}">${section.label}</button>`).join("");
  SUBMENU_SECTIONS.forEach((section) => {
    const button = document.querySelector(`[data-section="${section.key}"]`);
    button?.addEventListener("click", () => showSubmenuSection(section.key));
  });
}

async function renderTasksPanel() {
  const tasks = (await getAll("tasks"))
    .filter((task) => task.jobId === selectedJobId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const todo = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  panels.lavori.innerHTML = `
    <article class="card">
      <div class="toolbar">
        <h3>Elenco lavori da eseguire</h3>
        <button id="add-task-btn" class="primary">Nuova lavorazione</button>
      </div>
      ${todo.length ? todo.map((task) => `<label class="task-item"><input type="checkbox" data-complete-task-id="${task.id}" /> ${escapeHtml(task.title)}</label>`).join("") : `<p class="meta">Nessuna lavorazione pianificata.</p>`}
    </article>
    <article class="card">
      <h3>Lavori eseguiti</h3>
      ${done.length ? done.map((task) => `<details class="entry-item"><summary><strong>${escapeHtml(task.title)}</strong><span class="meta">${formatDateLabel(task.completedAt?.slice(0, 10))}</span></summary><div class="entry-details"><p><strong>Materiali:</strong> ${escapeHtml(task.completion?.materials || "-")}</p><p><strong>Problemi:</strong> ${escapeHtml(task.completion?.issues || "-")}</p><p><strong>Note finali:</strong> ${escapeHtml(task.completion?.finalNotes || "-")}</p>${(task.completion?.photos || []).length ? `<div class="photo-grid">${task.completion.photos.map((photo) => `<img src="${photo.dataUrl}" alt="${escapeHtml(photo.name || "foto lavorazione")}" />`).join("")}</div>` : `<p class="meta">Nessuna foto allegata.</p>`}</div></details>`).join("") : `<p class="meta">Nessuna lavorazione eseguita.</p>`}
    </article>
  `;

  document.getElementById("add-task-btn")?.addEventListener("click", () => dialogs.task.showModal());
  document.querySelectorAll("[data-complete-task-id]").forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) {
        const form = document.getElementById("task-completion-form");
        form.taskId.value = el.dataset.completeTaskId;
        pendingTaskPhotos = [];
        document.getElementById("task-photo-preview").innerHTML = "";
        document.getElementById("task-photo-input").value = "";
        dialogs.taskCompletion.showModal();
      }
    });
  });
}

function renderSubPanels(entries) {
  const quickButton = (label, field) => `<button class="secondary" data-open-entry-field="${field}">Aggiungi dato: ${label}</button>`;
  const totalPhotos = entries.reduce((acc, e) => acc + (e.photos || []).length, 0);

  panels.panoramica.innerHTML = `
    <article class="card">
      <h3>Panoramica commessa</h3>
      <p class="meta">Registrazioni totali: ${entries.length}</p>
      <p class="meta">Foto totali: ${totalPhotos}</p>
      ${quickButton("Panoramica", "workDescription")}
    </article>
  `;

  panels.presenze.innerHTML = `<article class="card"><h3>Presenze</h3><p class="meta">Sezione dedicata alle presenze operatori.</p>${quickButton("Presenze", "operators")}</article>`;
  panels.mezzi.innerHTML = `<article class="card"><h3>Mezzi e attrezzature</h3><p class="meta">Riepilogo mezzi usati e ore utilizzo.</p>${quickButton("Mezzi", "equipment")}</article>`;
  panels.materiali.innerHTML = `<article class="card"><h3>Materiali</h3><p class="meta">Riepilogo materiali e quantità.</p>${quickButton("Materiali", "materials")}</article>`;
  panels.problemi.innerHTML = `<article class="card"><h3>Problemi / anomalie</h3><p class="meta">Riepilogo criticità e sicurezza.</p>${quickButton("Problemi", "issues")}</article>`;

  panels.foto.innerHTML = entries.some((entry) => (entry.photos || []).length)
    ? `<article class="card"><h3>Foto</h3><div class="photo-grid">${entries
        .flatMap((entry) => (entry.photos || []).map((photo) => `<img src="${photo.dataUrl}" alt="${escapeHtml(photo.name || "foto cantiere")}" />`))
        .join("")}</div></article>`
    : `<article class="card"><h3>Foto</h3><p class="meta">Nessuna foto presente.</p><button class="secondary" data-open-entry-field="workDescription">Aggiungi nuova voce con foto</button></article>`;

  const latestNotes = entries
    .filter((entry) => entry.finalNotes)
    .slice(0, 5)
    .map((entry) => `<li><strong>${formatDateLabel(entry.date)}</strong>: ${escapeHtml(entry.finalNotes)}</li>`)
    .join("");

  panels.note.innerHTML = `<article class="card"><h3>Note finali</h3>${latestNotes ? `<ul>${latestNotes}</ul>` : `<p class="meta">Nessuna nota finale registrata.</p>`}${quickButton("Note finali", "finalNotes")}</article>`;

  document.querySelectorAll("[data-open-entry-field]").forEach((btn) => {
    btn.addEventListener("click", () => openEntryDialog(btn.dataset.openEntryField));
  });
}

async function openJobDetail(jobId) {
  selectedJobId = jobId;
  const jobs = await getAll("jobs");
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;

  jobMainData.innerHTML = `
    <h2>${escapeHtml(job.name)}</h2>
    <p class="meta">Codice: ${escapeHtml(job.code || "-")}</p>
    <p class="meta">Cliente: ${escapeHtml(job.client || "-")}</p>
    <p class="meta">Responsabile: ${escapeHtml(job.manager || "-")}</p>
  `;

  const entries = await renderEntries(jobId);
  renderSubPanels(entries);
  await renderTasksPanel();
  showSubmenuSection("panoramica");
  showView("detail");
}

async function renderEntries(jobId) {
  const allEntries = await getAll("entries");
  const entries = allEntries
    .filter((e) => e.jobId === jobId)
    .sort((a, b) => (getGroupDateKey(a) < getGroupDateKey(b) ? 1 : -1));

  const grouped = entries.reduce((acc, entry) => {
    const dateKey = getGroupDateKey(entry);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const orderedDates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  entriesList.innerHTML = orderedDates.length
    ? orderedDates
        .map((dateKey) => {
          const itemsHtml = grouped[dateKey]
            .map(
              (entry) => `
              <details class="entry-item">
                <summary>
                  <strong>${escapeHtml(entry.siteName || "Cantiere")}</strong>
                  <span class="meta">${escapeHtml(entry.entryTime || "--:--")} - ${escapeHtml(entry.exitTime || "--:--")}</span>
                </summary>
                <div class="entry-details">
                  <p><strong>Operatori:</strong> ${escapeHtml(entry.operators || "-")}</p>
                  <p><strong>Meteo:</strong> ${escapeHtml(entry.weather || "-")}</p>
                  <p><strong>Lavori eseguiti:</strong> ${escapeHtml(entry.workDescription || "-")}</p>
                  <p><strong>Mezzi usati:</strong> ${escapeHtml(entry.equipment || "-")}</p>
                  <p><strong>Materiali:</strong> ${escapeHtml(entry.materials || "-")}</p>
                  <p><strong>Problemi / anomalie:</strong> ${escapeHtml(entry.issues || "-")}</p>
                  <p><strong>Note finali:</strong> ${escapeHtml(entry.finalNotes || "-")}</p>
                  <p><strong>Conferma operatore:</strong> ${escapeHtml(entry.operatorSignature || "-")}</p>
                  ${(entry.photos || []).length ? `<div class="photo-grid">${entry.photos.map((photo) => `<img src="${photo.dataUrl}" alt="${escapeHtml(photo.name || "foto cantiere")}" />`).join("")}</div>` : `<p class="meta">Nessuna foto allegata.</p>`}
                </div>
              </details>
            `
            )
            .join("");

          return `
            <article class="date-group card">
              <h3>${formatDateLabel(dateKey)}</h3>
              <div class="list">${itemsHtml}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="card">Nessuna registrazione inserita.</div>`;

  return entries;
}

document.getElementById("add-job-btn").addEventListener("click", () => dialogs.job.showModal());

document.getElementById("job-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const newId = await add("jobs", {
    name: fd.get("name"),
    code: fd.get("code"),
    client: fd.get("client"),
    manager: fd.get("manager"),
    createdAt: new Date().toISOString()
  });

  dialogs.job.close();
  e.target.reset();
  await renderJobs(jobSearch.value);
  await openJobDetail(newId);
});

document.getElementById("cancel-job-btn").addEventListener("click", () => {
  document.getElementById("job-form").reset();
  dialogs.job.close();
});

document.getElementById("add-entry-btn").addEventListener("click", () => openEntryDialog());

document.getElementById("entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  payload.jobId = selectedJobId;
  payload.photos = pendingPhotos;
  payload.createdAt = new Date().toISOString();

  await add("entries", payload);
  dialogs.entry.close();

  const entries = await renderEntries(selectedJobId);
  renderSubPanels(entries);
  showSubmenuSection("giornale");
  resetEntryDialog();
});

document.getElementById("cancel-entry-btn").addEventListener("click", () => {
  resetEntryDialog();
  dialogs.entry.close();
});

document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await add("tasks", {
    jobId: selectedJobId,
    title: fd.get("title"),
    description: fd.get("description"),
    status: "todo",
    createdAt: new Date().toISOString()
  });
  e.target.reset();
  dialogs.task.close();
  await renderTasksPanel();
  showSubmenuSection("lavori");
});

document.getElementById("cancel-task-btn").addEventListener("click", () => {
  document.getElementById("task-form").reset();
  dialogs.task.close();
});

document.getElementById("task-completion-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const taskId = Number(fd.get("taskId"));
  const tasks = await getAll("tasks");
  const task = tasks.find((t) => t.id === taskId && t.jobId === selectedJobId);
  if (!task) return;

  task.status = "done";
  task.completedAt = new Date().toISOString();
  task.completion = {
    materials: fd.get("materials"),
    issues: fd.get("issues"),
    finalNotes: fd.get("finalNotes"),
    photos: pendingTaskPhotos
  };

  await put("tasks", task);
  pendingTaskPhotos = [];
  document.getElementById("task-completion-form").reset();
  dialogs.taskCompletion.close();
  await renderTasksPanel();
  showSubmenuSection("lavori");
});

document.getElementById("cancel-task-completion-btn").addEventListener("click", () => {
  pendingTaskPhotos = [];
  document.getElementById("task-photo-preview").innerHTML = "";
  document.getElementById("task-photo-input").value = "";
  document.getElementById("task-completion-form").reset();
  dialogs.taskCompletion.close();
});

document.getElementById("photo-input").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    pendingPhotos.push({ name: file.name, dataUrl });
  }
  document.getElementById("photo-preview").innerHTML = pendingPhotos.map((p) => `<img src="${p.dataUrl}" alt="${escapeHtml(p.name)}" />`).join("");
});

document.getElementById("task-photo-input").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    pendingTaskPhotos.push({ name: file.name, dataUrl });
  }
  document.getElementById("task-photo-preview").innerHTML = pendingTaskPhotos.map((p) => `<img src="${p.dataUrl}" alt="${escapeHtml(p.name)}" />`).join("");
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

document.getElementById("back-to-jobs").addEventListener("click", () => showView("jobs"));
jobSearch.addEventListener("input", () => renderJobs(jobSearch.value));

(async function init() {
  db = await openDB();
  buildSubmenu();
  await renderJobs();
})();
