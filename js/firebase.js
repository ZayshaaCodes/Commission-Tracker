import { $ } from './utils.js';
import { state, STORAGE_KEY, LOCAL_KEYS } from './state.js';
import { shopId } from './shop.js';

export const FIREBASE_URL = 'https://dreamworks-commission-default-rtdb.firebaseio.com';

function shopPath(path) {
  return `${FIREBASE_URL}/shops/${shopId}/${path}`;
}

// === SYNC STATE ===
let syncTimer = null;
let syncInFlight = false;
let initialLoadDone = false;
let ignoreNextStream = false;
let onRemoteData = null;

export function markInitialLoadDone() { initialLoadDone = true; }

export function onRemoteUpdate(fn) { onRemoteData = fn; }

export function scheduleSync() {
  if (!initialLoadDone) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushToFirebase(), 1500);
}

export function updateSyncBadge(text, ok) {
  const el = $('syncDot');
  if (!el) return;
  el.title = text;
  el.className = 'sync-dot' + (ok ? ' connected' : '');
}

// === LOAD ===
export async function loadFromFirebase() {
  try {
    updateSyncBadge('Loading...', false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(shopPath('state.json'), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (data) {
      Object.keys(data).forEach(k => {
        if (!LOCAL_KEYS.has(k)) state[k] = data[k];
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    updateSyncBadge('Synced', true);
    if ($('firebaseStatus')) {
      $('firebaseStatus').textContent = 'Connected to Firebase.';
      $('firebaseStatus').style.color = '#4ade80';
    }
    return true;
  } catch (err) {
    updateSyncBadge('Offline', false);
    if ($('firebaseStatus')) {
      $('firebaseStatus').textContent = 'Could not reach Firebase: ' + err.message + '. Using local data.';
      $('firebaseStatus').style.color = '#f87171';
    }
    return false;
  }
}

// === PUSH ===
export async function pushToFirebase() {
  if (syncInFlight || !initialLoadDone) return;
  syncInFlight = true;
  ignoreNextStream = true;
  try {
    updateSyncBadge('Saving...', false);
    const shared = {};
    for (const [k, v] of Object.entries(state)) {
      if (!LOCAL_KEYS.has(k)) shared[k] = v;
    }
    const payload = JSON.parse(JSON.stringify(shared, (key, val) => val === Infinity ? 'Infinity' : val));

    const res = await fetch(shopPath('state.json'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    updateSyncBadge('Synced', true);
  } catch (err) {
    updateSyncBadge('Sync Error', false);
    ignoreNextStream = false;
  } finally {
    syncInFlight = false;
  }
}

// === REAL-TIME STREAMING (SSE) ===
let eventSource = null;

export function startStreaming() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(shopPath('state.json'));

  function applyRemoteData(data) {
    Object.keys(data).forEach(k => {
      if (!LOCAL_KEYS.has(k)) state[k] = data[k];
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (onRemoteData) onRemoteData();
    updateSyncBadge('Synced', true);
  }

  eventSource.addEventListener('put', (e) => {
    if (ignoreNextStream) { ignoreNextStream = false; return; }
    try {
      const msg = JSON.parse(e.data);
      if (msg.path === '/' && msg.data) applyRemoteData(msg.data);
    } catch { /* ignore parse errors */ }
  });

  eventSource.addEventListener('patch', (e) => {
    if (ignoreNextStream) { ignoreNextStream = false; return; }
    try {
      const msg = JSON.parse(e.data);
      if (msg.path === '/' && msg.data) applyRemoteData(msg.data);
    } catch { /* ignore parse errors */ }
  });

  eventSource.onerror = () => {
    updateSyncBadge('Reconnecting...', false);
  };
}

// === LEGACY MIGRATION ===
// Moves data from the old root /state.json to /shops/dreamworks/state.json
export async function migrateLegacyData() {
  if (shopId !== 'dreamworks') return;
  try {
    // Check if shop path already has data
    const shopRes = await fetch(shopPath('state.json'));
    const shopData = await shopRes.json();
    if (shopData) return; // already migrated

    // Read legacy root data
    const legacyRes = await fetch(FIREBASE_URL + '/state.json');
    const legacyData = await legacyRes.json();
    if (!legacyData) return; // nothing to migrate

    // Copy to new shop path
    await fetch(shopPath('state.json'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyData)
    });

    // Copy passcodes
    const [pcRes, epcRes] = await Promise.all([
      fetch(FIREBASE_URL + '/passcode.json'),
      fetch(FIREBASE_URL + '/employeePasscode.json')
    ]);
    const [pc, epc] = await Promise.all([pcRes.json(), epcRes.json()]);
    if (pc) await fetch(shopPath('passcode.json'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pc)
    });
    if (epc) await fetch(shopPath('employeePasscode.json'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(epc)
    });
  } catch { /* migration is best-effort */ }
}
