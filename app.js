const DB_NAME = "giornale-cantiere-db";
const DB_VERSION = 1;
let db;
let selectedJobId = null;
let pendingPhotos = [];
const DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", { dateStyle: "short" });

const views = {
  jobs: document.getElementById("jobs-view"),
  detail: document.getElementById("job-detail-view")
};

const SUBMENU_SECTIONS = [
  { key: "panoramica", label: "Panoramica", panelId: "panel-panoramica" },
  { key: "giornale", label: "Giornale cantiere", panelId: "panel-giornale" },
  { key: "presenze", label: "Presenze", panelId: "panel-presenze" },
  { key: "lavori", label: "Lavori eseguiti", panelId: "panel-lavori" },
  { key: "mezzi", label: "Mezzi e attrezzature", panelId: "panel-mezzi" },
  { key: "materiali", label: "Materiali", panelId: "panel-materiali" },
  { key: "problemi", label: "Problemi / anomalie", panelId: "panel-problemi" },
  { key: "foto", label: "Foto", panelId: "panel-foto" },
  { key: "note", label: "Note finali", panelId: "panel-note" }
];

const jobsList = document.getElementById("jobs-list");
const entriesList = document.getElementById("entries-list");
const jobMainData = document.getElementById("job-main-data");
const jobSearch = document.getElementById("job-search");
const jobSubmenu = document.getElementById("job-submenu");

const panels = Object.fromEntries(SUBMENU_SECTIONS.map((s) => [s.key, document.getElementById(s.panelId)]));

const jobDialog = document.getElementById("job-dialog");
const entryDialog = document.getElementById("entry-dialog");

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

function renderSubPanels(entries) {
  const totalPhotos = entries.reduce((acc, e) => acc + (e.photos || []).length, 0);

  panels.panoramica.innerHTML = `
    <article class="card">
      <h3>Panoramica commessa</h3>
      <p class="meta">Registrazioni totali: ${entries.length}</p>
      <p class="meta">Foto totali: ${totalPhotos}</p>
      <p class="meta">Pronto per filtri futuri: data, commessa, operatore.</p>
    </article>
  `;

  panels.presenze.innerHTML = `<article class="card"><h3>Presenze</h3><p class="meta">Sezione dedicata alle presenze operatori (vista estendibile).</p></article>`;
  panels.lavori.innerHTML = `<article class="card"><h3>Lavori eseguiti</h3><p class="meta">Riepilogo attività per commessa (vista estendibile).</p></article>`;
  panels.mezzi.innerHTML = `<article class="card"><h3>Mezzi e attrezzature</h3><p class="meta">Riepilogo mezzi usati e ore utilizzo (vista estendibile).</p></article>`;
  panels.materiali.innerHTML = `<article class="card"><h3>Materiali</h3><p class="meta">Riepilogo materiali e quantità (vista estendibile).</p></article>`;
  panels.problemi.innerHTML = `<article class="card"><h3>Problemi / anomalie</h3><p class="meta">Riepilogo criticità e sicurezza (vista estendibile).</p></article>`;

  panels.foto.innerHTML = entries.some((entry) => (entry.photos || []).length)
    ? `<article class="card"><h3>Foto</h3><div class="photo-grid">${entries
        .flatMap((entry) => (entry.photos || []).map((photo) => `<img src="${photo.dataUrl}" alt="${escapeHtml(photo.name || "foto cantiere")}" />`))
        .join("")}</div></article>`
    : `<article class="card"><h3>Foto</h3><p class="meta">Nessuna foto presente.</p></article>`;

  const latestNotes = entries
    .filter((entry) => entry.finalNotes)
    .slice(0, 5)
    .map((entry) => `<li><strong>${formatDateLabel(entry.date)}</strong>: ${escapeHtml(entry.finalNotes)}</li>`)
    .join("");

  panels.note.innerHTML = `<article class="card"><h3>Note finali</h3>${latestNotes ? `<ul>${latestNotes}</ul>` : `<p class="meta">Nessuna nota finale registrata.</p>`}</article>`;
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

document.getElementById("add-job-btn").addEventListener("click", () => jobDialog.showModal());

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

  jobDialog.close();
  e.target.reset();
  await renderJobs(jobSearch.value);
  await openJobDetail(newId);
});

document.getElementById("add-entry-btn").addEventListener("click", () => {
  if (!selectedJobId) return;
  pendingPhotos = [];
  document.getElementById("photo-preview").innerHTML = "";
  entryDialog.showModal();
});

document.getElementById("entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  payload.jobId = selectedJobId;
  payload.photos = pendingPhotos;
  payload.createdAt = new Date().toISOString();

  await add("entries", payload);
  entryDialog.close();
  e.target.reset();
  pendingPhotos = [];
  document.getElementById("photo-input").value = "";

  const entries = await renderEntries(selectedJobId);
  renderSubPanels(entries);
  showSubmenuSection("giornale");
});

document.getElementById("photo-input").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    pendingPhotos.push({ name: file.name, dataUrl });
  }
  renderPhotoPreview();
});

function renderPhotoPreview() {
  const container = document.getElementById("photo-preview");
  container.innerHTML = pendingPhotos.map((p) => `<img src="${p.dataUrl}" alt="${escapeHtml(p.name)}" />`).join("");
}

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
