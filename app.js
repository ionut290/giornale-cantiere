const DB_NAME = "giornale-cantiere-db";
const DB_VERSION = 1;
let db;
let selectedJobId = null;
let pendingPhotos = [];

const views = {
  jobs: document.getElementById("jobs-view"),
  detail: document.getElementById("job-detail-view")
};

const jobsList = document.getElementById("jobs-list");
const entriesList = document.getElementById("entries-list");
const jobMainData = document.getElementById("job-main-data");
const jobSearch = document.getElementById("job-search");

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
        <h3>${j.name}</h3>
        <p class="meta">${j.code || "Nessun codice"} • ${j.client || "Cliente non indicato"}</p>
      </article>
    `
        )
        .join("")
    : `<div class="card">Nessuna commessa presente.</div>`;

  [...jobsList.querySelectorAll(".job-item")].forEach((item) => {
    item.addEventListener("click", () => openJobDetail(Number(item.dataset.id)));
  });
}

async function openJobDetail(jobId) {
  selectedJobId = jobId;
  const jobs = await getAll("jobs");
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;

  jobMainData.innerHTML = `
    <h2>${job.name}</h2>
    <p class="meta">Codice: ${job.code || "-"}</p>
    <p class="meta">Cliente: ${job.client || "-"}</p>
    <p class="meta">Responsabile: ${job.manager || "-"}</p>
  `;

  await renderEntries(jobId);
  showView("detail");
}

async function renderEntries(jobId) {
  const allEntries = await getAll("entries");
  const entries = allEntries.filter((e) => e.jobId === jobId).sort((a, b) => (a.date < b.date ? 1 : -1));

  entriesList.innerHTML = entries.length
    ? entries
        .map(
          (e) => `
      <article class="entry-item">
        <h3>${e.date} — ${e.siteName}</h3>
        <p class="meta">${e.location || "Località non indicata"}</p>
        <p>${e.workDescription || ""}</p>
        <p class="meta">Foto allegate: ${(e.photos || []).length}</p>
      </article>
    `
        )
        .join("")
    : `<div class="card">Nessuna registrazione inserita.</div>`;
}

document.getElementById("add-job-btn").addEventListener("click", () => jobDialog.showModal());

document.getElementById("job-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await add("jobs", {
    name: fd.get("name"),
    code: fd.get("code"),
    client: fd.get("client"),
    manager: fd.get("manager"),
    createdAt: new Date().toISOString()
  });
  jobDialog.close();
  e.target.reset();
  renderJobs(jobSearch.value);
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
  await renderEntries(selectedJobId);
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
  container.innerHTML = pendingPhotos.map((p) => `<img src="${p.dataUrl}" alt="${p.name}" />`).join("");
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
  await renderJobs();
})();
