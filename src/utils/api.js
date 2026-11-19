// Client for the FastAPI backend (backend_api.py), which serves the v2 convergence model.
// In development the API runs separately on port 8000; in production (Vercel) it is served from the same origin.
export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

async function request(path, opts = {}) {
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail; } catch { /* body was not JSON */ }
    throw new Error(`API ${res.status}${detail ? ': ' + JSON.stringify(detail) : ''}`);
  }
  return res.json();
}

const post = (path, body, signal) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });

export const getHealth = () => request('/');
export const getMeta = () => request('/api/meta');
export const getScenario = (body, signal) => post('/api/scenario', body, signal);
export const getExplain = (body, signal) => post('/api/explain', body, signal);

// Kept for older components that still call it.
export const fetchPrediction = (body) => post('/api/predict', body);
export async function checkHealth() {
  try { return (await getHealth()).model_loaded === true; } catch { return false; }
}
