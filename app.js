const DB_NAME = "giornale-cantiere-db";
const DB_VERSION = 3;
let db;
let selectedJobId = null;
const DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", { dateStyle: "short" });

const photoState = { entry: [], section: [], task: [] };
let activeViewerPhoto = null;
let journalDateFilter = "";

const SECTION_CONFIG = {
  presenze: { title: "Nuove presenze", labels: ["Operatori presenti", "Orario entrata", "Orario uscita"] },
  lavori: { title: "Nuovi lavori eseguiti", labels: ["Lavori eseguiti", "Zona cantiere", "Stato avanzamento"] },
  mezzi: { title: "Nuovi mezzi e attrezzature", labels: ["Mezzi usati", "Ore utilizzo mezzi", "Guasti"] },
  materiali: { title: "Nuovi materiali", labels: ["Materiali", "Quantità", "Consegne"] },
  problemi: { title: "Nuovi problemi / anomalie", labels: ["Problemi / anomalie", "Sicurezza", "Note"] },
  note: { title: "Nuove note finali", labels: ["Note finali", "Conferma operatore", "Extra"] },
  foto: { title: "Nuova registrazione foto", labels: ["Descrizione foto", "Posizione", "Dettaglio"] }
};

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

const dialogs = {
  job: document.getElementById("job-dialog"),
  entry: document.getElementById("entry-dialog"),
  section: document.getElementById("section-dialog"),
  task: document.getElementById("task-dialog"),
  taskCompletion: document.getElementById("task-completion-dialog"),
  photoViewer: document.getElementById("photo-viewer-dialog")
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
        entries.createIndex("sectionType", "sectionType");
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

const tx = (store, mode = "readonly") => db.transaction(store, mode).objectStore(store);
const add = (store, data) => promisifyRequest(tx(store, "readwrite").add(data));
const put = (store, data) => promisifyRequest(tx(store, "readwrite").put(data));
const getAll = (store) => promisifyRequest(tx(store).getAll());

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
}

function showSubmenuSection(sectionKey) {
  SUBMENU_SECTIONS.forEach((section) => {
    document.querySelector(`[data-section="${section.key}"]`)?.classList.toggle("active", section.key === sectionKey);
    panels[section.key]?.classList.toggle("active", section.key === sectionKey);
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

const formatDateLabel = (dateStr) => {
  if (!dateStr) return "Data non specificata";
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dateStr : DATE_FORMATTER.format(date);
};

const getGroupDateKey = (entry) => entry.date || entry.createdAt?.slice(0, 10) || "0000-00-00";

function buildSubmenu() {
  jobSubmenu.innerHTML = SUBMENU_SECTIONS.map((s) => `<button class="submenu-btn" data-section="${s.key}">${s.label}</button>`).join("");
  SUBMENU_SECTIONS.forEach((s) => document.querySelector(`[data-section="${s.key}"]`)?.addEventListener("click", () => showSubmenuSection(s.key)));
}

async function renderJobs(filter = "") {
  const jobs = await getAll("jobs");
  const query = filter.trim().toLowerCase();
  const filtered = query ? jobs.filter((j) => `${j.name} ${j.code || ""} ${j.client || ""}`.toLowerCase().includes(query)) : jobs;

  jobsList.innerHTML = filtered.length
    ? filtered
        .map((j) => `<article class="job-item" data-id="${j.id}"><h3>${escapeHtml(j.name)}</h3><p class="meta">${escapeHtml(j.code || "Nessun codice")} • ${escapeHtml(j.client || "Cliente non indicato")}</p></article>`)
        .join("")
    : `<div class="card">Nessuna commessa presente.</div>`;

  jobsList.querySelectorAll(".job-item").forEach((el) => el.addEventListener("click", () => openJobDetail(Number(el.dataset.id))));
}

function renderPhotoList(stateKey) {
  const container = document.querySelector(`[data-photo-list="${stateKey}"]`);
  container.innerHTML = photoState[stateKey]
    .map(
      (photo, idx) => `
      <div class="photo-item">
        <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}" data-open-photo="${stateKey}:${idx}" />
        <textarea data-photo-note="${stateKey}:${idx}" placeholder="Nota foto...">${escapeHtml(photo.note || "")}</textarea>
      </div>
    `
    )
    .join("");

  container.querySelectorAll("[data-photo-note]").forEach((ta) => {
    ta.addEventListener("input", () => {
      const [key, idx] = ta.dataset.photoNote.split(":");
      photoState[key][Number(idx)].note = ta.value;
    });
  });
  container.querySelectorAll("[data-open-photo]").forEach((img) => {
    img.addEventListener("click", () => {
      const [key, idx] = img.dataset.openPhoto.split(":");
      openPhotoViewer(photoState[key][Number(idx)]);
    });
  });
}

async function handlePhotoInputChange(stateKey, files) {
  for (const file of files) {
    photoState[stateKey].push({ name: file.name || `foto-${Date.now()}.jpg`, note: "", dataUrl: await fileToDataUrl(file) });
  }
  renderPhotoList(stateKey);
}

function resetPhotoState(stateKey) {
  photoState[stateKey] = [];
  renderPhotoList(stateKey);
  document.querySelector(`[data-photo-input="${stateKey}"]`).value = "";
}

function openSectionDialog(sectionType) {
  const cfg = SECTION_CONFIG[sectionType];
  const form = document.getElementById("section-form");
  form.reset();
  form.sectionType.value = sectionType;
  form.date.value = new Date().toISOString().slice(0, 10);
  document.getElementById("section-form-title").textContent = cfg.title;

  const fieldsContainer = document.getElementById("section-fields");
  fieldsContainer.innerHTML = cfg.labels
    .map((label, idx) => `<label>${escapeHtml(label)}<textarea name="field${idx + 1}"></textarea></label>`)
    .join("");

  resetPhotoState("section");
  dialogs.section.showModal();
}

function openPhotoViewer(photo) {
  activeViewerPhoto = photo;
  document.getElementById("photo-viewer-img").src = photo.dataUrl;
  document.getElementById("photo-viewer-note").textContent = photo.note ? `Nota: ${photo.note}` : "Nessuna nota per questa foto.";

  const shareText = encodeURIComponent(`Foto cantiere${photo.note ? ` - Nota: ${photo.note}` : ""}`);
  document.getElementById("share-whatsapp-link").href = `https://wa.me/?text=${shareText}`;
  document.getElementById("share-email-link").href = `mailto:?subject=Foto%20cantiere&body=${shareText}`;
  dialogs.photoViewer.showModal();
}

async function shareActivePhotoNative() {
  if (!activeViewerPhoto || !navigator.share) return;
  try {
    const file = dataUrlToFile(activeViewerPhoto.dataUrl, activeViewerPhoto.name || "foto-cantiere.jpg");
    await navigator.share({ files: [file], title: "Foto cantiere", text: activeViewerPhoto.note || "Foto cantiere" });
  } catch (_) {
    // user dismissed
  }
}

function dataUrlToFile(dataUrl, fileName) {
  const [meta, data] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new File([arr], fileName, { type: mime });
}

async function openJobDetail(jobId) {
  selectedJobId = jobId;
  const job = (await getAll("jobs")).find((j) => j.id === jobId);
  if (!job) return;

  jobMainData.innerHTML = `<h2>${escapeHtml(job.name)}</h2><p class="meta">Codice: ${escapeHtml(job.code || "-")}</p><p class="meta">Cliente: ${escapeHtml(job.client || "-")}</p><p class="meta">Responsabile: ${escapeHtml(job.manager || "-")}</p>`;

  const entries = await renderEntries(jobId, journalDateFilter);
  await renderTasksPanel();
  renderSubPanels(entries);
  showSubmenuSection("panoramica");
  showView("detail");
}

async function renderEntries(jobId, filterDate = "") {
  const entries = (await getAll("entries")).filter((e) => e.jobId === jobId).sort((a, b) => (getGroupDateKey(a) < getGroupDateKey(b) ? 1 : -1));
  const filteredEntries = filterDate ? entries.filter((e) => getGroupDateKey(e) === filterDate) : entries;
  const grouped = filteredEntries.reduce((acc, e) => ((acc[getGroupDateKey(e)] ??= []).push(e), acc), {});

  entriesList.innerHTML = Object.keys(grouped)
    .sort((a, b) => (a < b ? 1 : -1))
    .map(
      (dateKey) => `<article class="date-group card"><h3>${formatDateLabel(dateKey)}</h3><div class="list">${grouped[dateKey]
        .map(
          (e) => `<details class="entry-item"><summary><strong>${escapeHtml(e.sectionType || "giornale")}</strong><span class="meta">${escapeHtml(e.siteName || "Voce")}</span></summary><div class="entry-details"><p><strong>Dettaglio:</strong> ${escapeHtml(e.workDescription || e.field1 || "-")}</p><p><strong>Nota:</strong> ${escapeHtml(e.finalNotes || e.field3 || "-")}</p><p class="meta">Foto: ${(e.photos || []).length}</p>${renderPhotoThumbs(e.photos || [])}</div></details>`
        )
        .join("")}</div></article>`
    )
    .join("") || `<div class="card">${filterDate ? "Nessuna voce per il giorno selezionato." : "Nessuna registrazione inserita."}</div>`;

  return entries;
}

async function renderTasksPanel() {
  const tasks = (await getAll("tasks")).filter((t) => t.jobId === selectedJobId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const todo = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  panels.lavori.innerHTML = `<article class="card"><div class="toolbar"><h3>Elenco lavori da eseguire</h3><button id="add-task-btn" class="primary">Nuova lavorazione</button></div>${todo.length ? todo.map((t) => `<label class="task-item"><input type="checkbox" data-complete-task-id="${t.id}" /> ${escapeHtml(t.title)}</label>`).join("") : `<p class="meta">Nessuna lavorazione pianificata.</p>`}</article><article class="card"><h3>Lavori eseguiti</h3>${done.length ? done.map((t) => `<details class="entry-item"><summary><strong>${escapeHtml(t.title)}</strong><span class="meta">${formatDateLabel(t.completedAt?.slice(0, 10))}</span></summary><div class="entry-details"><p><strong>Materiali:</strong> ${escapeHtml(t.completion?.materials || "-")}</p><p><strong>Problemi:</strong> ${escapeHtml(t.completion?.issues || "-")}</p><p><strong>Note:</strong> ${escapeHtml(t.completion?.finalNotes || "-")}</p>${renderPhotoThumbs(t.completion?.photos || [])}</div></details>`).join("") : `<p class="meta">Nessuna lavorazione eseguita.</p>`}</article>`;

  document.getElementById("add-task-btn")?.addEventListener("click", () => dialogs.task.showModal());
  document.querySelectorAll("[data-complete-task-id]").forEach((el) => el.addEventListener("change", () => openTaskCompletion(el)));
}

function renderSubPanels(entries) {
  const counts = countSections(entries);
  panels.panoramica.innerHTML = `<article class="card"><h3>Panoramica</h3><p class="meta">Registrazioni totali: ${entries.length}</p></article>`;
  panels.presenze.innerHTML = `<article class="card"><h3>Presenze</h3><p class="meta">Voci: ${counts.presenze}</p><button class="secondary" data-open-section="presenze">Compila presenze</button></article>`;
  panels.mezzi.innerHTML = `<article class="card"><h3>Mezzi e attrezzature</h3><p class="meta">Voci: ${counts.mezzi}</p><button class="secondary" data-open-section="mezzi">Compila mezzi</button></article>`;
  panels.materiali.innerHTML = `<article class="card"><h3>Materiali</h3><p class="meta">Voci: ${counts.materiali}</p><button class="secondary" data-open-section="materiali">Compila materiali</button></article>`;
  panels.problemi.innerHTML = `<article class="card"><h3>Problemi / anomalie</h3><p class="meta">Voci: ${counts.problemi}</p><button class="secondary" data-open-section="problemi">Compila problemi</button></article>`;
  panels.note.innerHTML = `<article class="card"><h3>Note finali</h3><p class="meta">Voci: ${counts.note}</p><button class="secondary" data-open-section="note">Compila note finali</button></article>`;
  panels.foto.innerHTML = `<article class="card"><h3>Foto</h3><p class="meta">Foto totali: ${entries.reduce((acc, e) => acc + (e.photos || []).length, 0)}</p><button class="secondary" data-open-section="foto">Aggiungi foto</button><div class="photo-grid">${entries.flatMap((e) => (e.photos || []).map((p) => `<img src="${p.dataUrl}" alt="${escapeHtml(p.name)}" data-photo-lookup="${encodeURIComponent(JSON.stringify(p))}" />`)).join("")}</div></article>`;

  document.querySelectorAll("[data-open-section]").forEach((btn) => btn.addEventListener("click", () => openSectionDialog(btn.dataset.openSection)));
  document.querySelectorAll("[data-photo-lookup]").forEach((img) => img.addEventListener("click", () => openPhotoViewer(JSON.parse(decodeURIComponent(img.dataset.photoLookup)))));
}

function countSections(entries) {
  return entries.reduce(
    (acc, e) => {
      if (acc[e.sectionType] !== undefined) acc[e.sectionType] += 1;
      return acc;
    },
    { presenze: 0, mezzi: 0, materiali: 0, problemi: 0, note: 0, foto: 0 }
  );
}

function renderPhotoThumbs(photos) {
  if (!photos.length) return `<p class="meta">Nessuna foto allegata.</p>`;
  return `<div class="photo-grid">${photos.map((p) => `<img src="${p.dataUrl}" alt="${escapeHtml(p.name)}" data-photo-lookup="${encodeURIComponent(JSON.stringify(p))}" />`).join("")}</div>`;
}

async function openTaskCompletion(checkbox) {
  if (!checkbox.checked) return;
  const form = document.getElementById("task-completion-form");
  form.taskId.value = checkbox.dataset.completeTaskId;
  form.reset();
  form.taskId.value = checkbox.dataset.completeTaskId;
  resetPhotoState("task");
  dialogs.taskCompletion.showModal();
}

async function saveAndRefresh() {
  const entries = selectedJobId ? await renderEntries(selectedJobId, journalDateFilter) : [];
  renderSubPanels(entries);
  await renderTasksPanel();
}

document.getElementById("add-job-btn").addEventListener("click", () => dialogs.job.showModal());

document.getElementById("job-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = await add("jobs", { name: fd.get("name"), code: fd.get("code"), client: fd.get("client"), manager: fd.get("manager"), createdAt: new Date().toISOString() });
  dialogs.job.close();
  e.target.reset();
  await renderJobs(jobSearch.value);
  await openJobDetail(id);
});

document.getElementById("cancel-job-btn").addEventListener("click", () => {
  document.getElementById("job-form").reset();
  dialogs.job.close();
});

document.getElementById("add-entry-btn").addEventListener("click", () => {
  document.getElementById("entry-form").reset();
  document.getElementById("entry-form").date.value = new Date().toISOString().slice(0, 10);
  resetPhotoState("entry");
  dialogs.entry.showModal();
});

document.getElementById("entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await add("entries", {
    jobId: selectedJobId,
    sectionType: "giornale",
    date: fd.get("date"),
    siteName: fd.get("siteName"),
    operators: fd.get("operators"),
    entryTime: fd.get("entryTime"),
    exitTime: fd.get("exitTime"),
    weather: fd.get("weather"),
    workDescription: fd.get("workDescription"),
    equipment: fd.get("equipment"),
    materials: fd.get("materials"),
    issues: fd.get("issues"),
    finalNotes: fd.get("finalNotes"),
    operatorSignature: fd.get("operatorSignature"),
    photos: photoState.entry,
    createdAt: new Date().toISOString()
  });
  dialogs.entry.close();
  resetPhotoState("entry");
  await saveAndRefresh();
  showSubmenuSection("giornale");
});

document.getElementById("cancel-entry-btn").addEventListener("click", () => {
  document.getElementById("entry-form").reset();
  resetPhotoState("entry");
  dialogs.entry.close();
});

document.getElementById("section-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await add("entries", {
    jobId: selectedJobId,
    sectionType: fd.get("sectionType"),
    date: fd.get("date"),
    field1: fd.get("field1"),
    field2: fd.get("field2"),
    field3: fd.get("field3"),
    workDescription: fd.get("field1"),
    finalNotes: fd.get("field3"),
    photos: photoState.section,
    createdAt: new Date().toISOString()
  });
  dialogs.section.close();
  document.getElementById("section-form").reset();
  resetPhotoState("section");
  await saveAndRefresh();
  showSubmenuSection(fd.get("sectionType"));
});

document.getElementById("cancel-section-btn").addEventListener("click", () => {
  document.getElementById("section-form").reset();
  resetPhotoState("section");
  dialogs.section.close();
});

document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await add("tasks", { jobId: selectedJobId, title: fd.get("title"), description: fd.get("description"), status: "todo", createdAt: new Date().toISOString() });
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
  const task = (await getAll("tasks")).find((t) => t.id === taskId && t.jobId === selectedJobId);
  if (!task) return;
  task.status = "done";
  task.completedAt = new Date().toISOString();
  task.completion = { materials: fd.get("materials"), issues: fd.get("issues"), finalNotes: fd.get("finalNotes"), photos: photoState.task };
  await put("tasks", task);
  dialogs.taskCompletion.close();
  document.getElementById("task-completion-form").reset();
  resetPhotoState("task");
  await renderTasksPanel();
});

document.getElementById("cancel-task-completion-btn").addEventListener("click", () => {
  document.getElementById("task-completion-form").reset();
  resetPhotoState("task");
  dialogs.taskCompletion.close();
});

document.querySelectorAll("[data-photo-input]").forEach((input) => {
  input.addEventListener("change", (e) => handlePhotoInputChange(input.dataset.photoInput, [...e.target.files]));
});

document.getElementById("share-native-btn").addEventListener("click", shareActivePhotoNative);
document.getElementById("close-photo-viewer-btn").addEventListener("click", () => dialogs.photoViewer.close());

document.getElementById("journal-date-filter")?.addEventListener("change", async (e) => {
  journalDateFilter = e.target.value || "";
  if (selectedJobId) await renderEntries(selectedJobId, journalDateFilter);
});

document.getElementById("clear-journal-date")?.addEventListener("click", async () => {
  journalDateFilter = "";
  document.getElementById("journal-date-filter").value = "";
  if (selectedJobId) await renderEntries(selectedJobId, journalDateFilter);
});

document.getElementById("back-to-jobs").addEventListener("click", () => showView("jobs"));
jobSearch.addEventListener("input", () => renderJobs(jobSearch.value));

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

(async function init() {
  db = await openDB();
  buildSubmenu();
  await renderJobs();
})();
