import { addPendingReport, getPendingReports, removePendingReport, setCachedReports, getCachedReports } from '../offline/db';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function makeClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function fetchReports() {
  try {
    const response = await fetch(`${API_URL}/api/reports`);
    if (!response.ok) throw new Error('Error al cargar reportes');
    const data = await response.json();
    const reports = data.data || [];
    try { await setCachedReports(reports); } catch (_) {}
    return { ok: true, data: reports, fromCache: false };
  } catch (err) {
    try {
      const cached = await getCachedReports();
      return { ok: true, data: cached, fromCache: true, error: err.message };
    } catch (_) {
      return { ok: false, data: [], error: err.message };
    }
  }
}

export async function createReport(formData) {
  const payload = { ...formData, clientId: makeClientId(), createdAtLocal: new Date().toISOString() };

  // Si el navegador reporta offline, guardar directo
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await addPendingReport(payload);
    return { ok: true, queued: true, data: payload };
  }

  try {
    const response = await fetch(`${API_URL}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error al registrar reporte');
    return { ok: true, queued: false, data: data.data };
  } catch (err) {
    // Falla de red u otro error de conectividad: encolar para sincronizar
    await addPendingReport(payload);
    return { ok: true, queued: true, data: payload, error: err.message };
  }
}

export async function syncPendingReports(onProgress) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, remaining: (await getPendingReports()).length };
  }
  const pending = await getPendingReports();
  let synced = 0;
  for (const item of pending) {
    try {
      const response = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (response.ok) {
        await removePendingReport(item.clientId);
        synced++;
        if (onProgress) onProgress({ synced, total: pending.length });
      } else {
        // Si es error de validación (4xx), no reintentar infinitamente; lo dejamos? Mejor mantener y reportar
        const body = await response.json().catch(() => ({}));
        if (response.status >= 400 && response.status < 500) {
          await removePendingReport(item.clientId); // datos inválidos, descartar
        } else {
          break; // error servidor, detener
        }
      }
    } catch (_) {
      break; // sigue offline o error red
    }
  }
  const remaining = (await getPendingReports()).length;
  return { synced, remaining };
}

export { getPendingReports };
