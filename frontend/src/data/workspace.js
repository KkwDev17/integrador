const DB = "fielddesk-workspace";
const COLLECTIONS = ["reports", "clients", "technicians", "visits"];
const API = import.meta.env.PROD ? "" : import.meta.env.VITE_API_URL || "";
export const id = () => crypto.randomUUID();
let database;
let syncing;

async function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("records", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new Error(
            "No se pudo abrir el almacenamiento. Habilita los datos del sitio en tu navegador.",
          ),
        );
    });
  return database;
}
async function transact(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("records", mode);
    const result = action(tx.objectStore("records"));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function allRecords() {
  return (await transact("readonly", (s) => s.getAll())) || [];
}
export async function saveRecord(collection, values) {
  const record = {
    ...values,
    id: values.id || id(),
    collection,
    updatedAt: new Date().toISOString(),
    dirty: true,
  };
  record.createdAt ||= record.updatedAt;
  await transact("readwrite", (s) => s.put(record));
  return record;
}
export async function deleteRecord(record) {
  return saveRecord(record.collection, { ...record, deleted: true });
}
export function workspaceId() {
  let value = localStorage.getItem("fielddesk-workspace-id");
  if (!value) {
    value = id();
    localStorage.setItem("fielddesk-workspace-id", value);
  }
  return value;
}
async function request(path, options = {}) {
  const response = await fetch(`${API}/api/workspace${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId(),
      ...options.headers,
    },
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message || "No se pudo sincronizar con el servidor.");
  return body;
}
export async function syncRecords() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!navigator.onLine) return { mode: "offline", sent: 0 };
    const health = await request("/health");
    if (health.storage === "local-only") return { mode: "local-only", sent: 0 };
    let sent = 0;
    for (const record of (await allRecords()).filter((r) => r.dirty)) {
      const { dirty, ...payload } = record;
      const saved = await request(`/${record.collection}/${record.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      // Do not clear an edit that was made while this request was in flight.
      await transact("readwrite", (store) => {
        const get = store.get(record.id);
        get.onsuccess = () => {
          if (get.result?.updatedAt === record.updatedAt)
            store.put({ ...saved.data, dirty: false });
        };
      });
      sent++;
    }
    const remote = await request("");
    await transact("readwrite", (store) => {
      for (const record of remote.data) {
        const get = store.get(record.id);
        get.onsuccess = () => {
          const local = get.result;
          if (!local || (!local.dirty && local.updatedAt <= record.updatedAt))
            store.put({ ...record, dirty: false });
        };
      }
    });
    localStorage.setItem("fielddesk-last-sync", new Date().toISOString());
    return { mode: health.storage, sent };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
export async function migrateLegacy() {
  if (localStorage.getItem("fielddesk-migrated")) return;
  const databases = indexedDB.databases ? await indexedDB.databases() : [];
  const records = [];
  if (databases.some((d) => d.name === "reportes-tecnicos-db")) {
    const legacy = await import("../offline/db");
    records.push(
      ...(await legacy.getCachedReports()),
      ...(await legacy.getPendingReports()),
    );
  }
  // Keep existing server reports available when upgrading the local project.
  if (import.meta.env.DEV) {
    try {
      const response = await fetch(`${API}/api/reports`, {
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) records.push(...(await response.json()).data);
    } catch {
      /* Offline upgrade still migrates IndexedDB. */
    }
  }
  const existing = await allRecords();
  for (const r of records) {
    const recordId = r.id || r.clientId;
    if (
      existing.some(
        (e) => e.id === recordId || (r.clientId && e.clientId === r.clientId),
      )
    )
      continue;
    const record = await saveRecord("reports", {
      ...r,
      id: recordId,
      createdAt: r.fechaCreacion || r.createdAtLocal,
      priority: r.priority || "media",
      title: r.title || r.descripcionProblema?.slice(0, 70),
    });
    existing.push(record);
  }
  localStorage.setItem("fielddesk-migrated", "1");
}
export async function importBackup(value) {
  if (
    value?.format !== "fielddesk-v1" ||
    !Array.isArray(value.records) ||
    value.records.length > 10000
  )
    throw new Error("El archivo no es un respaldo válido de Fielddesk.");
  for (const r of value.records) {
    if (
      !r ||
      typeof r !== "object" ||
      !COLLECTIONS.includes(r.collection) ||
      typeof r.id !== "string" ||
      !/^[a-zA-Z\d-]{1,100}$/.test(r.id) ||
      Number.isNaN(Date.parse(r.updatedAt)) ||
      Number.isNaN(Date.parse(r.createdAt))
    )
      throw new Error("El respaldo contiene registros o fechas inválidos.");
    if (Object.values(r).some((v) => typeof v === "object" && v !== null))
      throw new Error("El respaldo contiene campos inválidos.");
    const filled = (v) => typeof v === "string" && !!v.trim();
    if (
      !r.deleted &&
      r.collection === "reports" &&
      (!filled(r.title) ||
        !filled(r.tecnico) ||
        !filled(r.clienteUbicacion) ||
        !filled(r.descripcionProblema) ||
        !["pendiente", "en-proceso", "completado"].includes(r.estado) ||
        !["alta", "media", "baja"].includes(r.priority))
    )
      throw new Error("Hay un reporte incompleto o inválido en el respaldo.");
    if (!r.deleted && r.collection !== "reports" && !filled(r.name))
      throw new Error("Hay un registro sin nombre en el respaldo.");
    if (
      !r.deleted &&
      r.collection === "technicians" &&
      !["disponible", "en-campo", "ausente"].includes(r.status)
    )
      throw new Error("Hay un técnico con disponibilidad inválida.");
    if (
      !r.deleted &&
      r.collection === "visits" &&
      (!filled(r.clientId) ||
        !filled(r.technicianId) ||
        !["programada", "realizada", "cancelada"].includes(r.status) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ||
        Number.isNaN(Date.parse(`${r.date}T${r.time}`)))
    )
      throw new Error("Hay una visita con fecha, hora o estado inválido.");
  }
  const existing = await allRecords();
  const merged = value.records.filter(
    (r) => !existing.some((e) => e.id === r.id && e.updatedAt > r.updatedAt),
  );
  await transact("readwrite", (store) => {
    for (const r of merged) store.put({ ...r, dirty: true });
  });
  return merged.length;
}
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(records) {
  const columns = [
    "title",
    "tecnico",
    "clienteUbicacion",
    "descripcionProblema",
    "estado",
    "priority",
    "scheduledAt",
    "createdAt",
  ];
  const cell = (v) =>
    `"${String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  const csv = [columns, ...records.map((r) => columns.map((c) => r[c]))]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  download("fielddesk-reportes.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
}
