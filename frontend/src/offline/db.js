const DB_NAME = 'reportes-tecnicos-db';
const DB_VERSION = 1;
const STORE_OUTBOX = 'outbox'; // reportes pendientes de sincronizar
const STORE_CACHE = 'reportsCache'; // cache local de reportes del servidor

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const store = db.createObjectStore(STORE_OUTBOX, { keyPath: 'clientId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'id' });
      }
    };
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function addPendingReport(report) {
  const db = await openDb();
  const tx = db.transaction(STORE_OUTBOX, 'readwrite');
  tx.objectStore(STORE_OUTBOX).put(report);
  await txDone(tx);
  db.close();
}

export async function getPendingReports() {
  const db = await openDb();
  const tx = db.transaction(STORE_OUTBOX, 'readonly');
  const store = tx.objectStore(STORE_OUTBOX);
  const request = store.getAll();
  const items = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function removePendingReport(clientId) {
  const db = await openDb();
  const tx = db.transaction(STORE_OUTBOX, 'readwrite');
  tx.objectStore(STORE_OUTBOX).delete(clientId);
  await txDone(tx);
  db.close();
}

export async function setCachedReports(reports) {
  const db = await openDb();
  const tx = db.transaction(STORE_CACHE, 'readwrite');
  const store = tx.objectStore(STORE_CACHE);
  store.clear();
  for (const r of reports) store.put(r);
  await txDone(tx);
  db.close();
}

export async function getCachedReports() {
  const db = await openDb();
  const tx = db.transaction(STORE_CACHE, 'readonly');
  const request = tx.objectStore(STORE_CACHE).getAll();
  const items = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return items;
}
