const PREFIX = 'xsimple-audio-studio:v1:';
let owner = 'guest';
export function setDraftOwner(id) { owner = id ? `user:${String(id)}` : 'guest'; }
export function readDrafts() {
  try { const value = JSON.parse(localStorage.getItem(PREFIX + owner) || 'null'); return value && typeof value === 'object' ? value : null; }
  catch { return null; }
}
export function saveDrafts(value) {
  try { localStorage.setItem(PREFIX + owner, JSON.stringify({ ...value, savedAt: Date.now() })); return true; }
  catch { return false; }
}
export function removeLocalDrafts() { try { localStorage.removeItem(PREFIX + owner); } catch {} }

// Audio, Google credentials and session/CSRF tokens are intentionally never stored here.
// Each account has a separate draft namespace; signing out clears its in-memory data.
