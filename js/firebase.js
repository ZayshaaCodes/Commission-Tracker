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
let onRemoteData = null;

// Snapshot of each key's JSON as last confirmed on the server.
// Used to detect which keys actually changed and need pushing.
let lastPushedJson = {};

export function markInitialLoadDone() { initialLoadDone = true; }

export function onRemoteUpdate(fn) { onRemoteData = fn; }

export function scheduleSync() {
  if (!initialLoadDone) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushToFirebase(), 1200);
}

/** Push pending changes immediately (use after critical ops like service adds) */
export function flushSync() {
  if (!initialLoadDone) return;
  clearTimeout(syncTimer);
  if (syncInFlight) {
    // A push is already in flight - schedule a follow-up so the change isn't lost
    syncTimer = setTimeout(() => pushToFirebase(), 400);
    return;
  }
  pushToFirebase();
}

export function updateSyncBadge(text, ok) {
  const el = $('syncDot');
  if (!el) return;
  el.title = text;
  el.className = 'sync-dot' + (ok ? ' connected' : '');
}

// === JSON HELPERS ===
function replacer(_key, val) {
  return val === Infinity ? '__Infinity__' : val;
}

// === DIRTY KEY DETECTION ===
// Compare current state to the last-pushed snapshot to find what needs syncing
function getChangedKeys() {
  const changed = [];
  for (const k of Object.keys(state)) {
    if (LOCAL_KEYS.has(k)) continue;
    const json = JSON.stringify(state[k], replacer);
    if (json !== lastPushedJson[k]) changed.push(k);
  }
  return changed;
}

function snapshotAllKeys() {
  for (const k of Object.keys(state)) {
    if (!LOCAL_KEYS.has(k)) {
      lastPushedJson[k] = JSON.stringify(state[k], replacer);
    }
  }
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
      for (const k of Object.keys(data)) {
        if (!LOCAL_KEYS.has(k)) state[k] = data[k];
      }
      // Treat the loaded data as our baseline for dirty detection
      snapshotAllKeys();
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

// === PUSH (PATCH-based, only changed keys) ===
export async function pushToFirebase() {
  if (syncInFlight || !initialLoadDone) return;

  const changed = getChangedKeys();
  if (changed.length === 0) return;

  syncInFlight = true;
  try {
    updateSyncBadge('Saving...', false);

    const topPatch = {};
    let workPatch = null;

    for (const k of changed) {
      const val = JSON.parse(JSON.stringify(state[k], replacer));
      if (k === 'work') {
        // Push work at state/work.json with PATCH so that other employees'
        // data written by other tabs is preserved on the server.
        workPatch = val;
      } else {
        topPatch[k] = val;
      }
    }

    const requests = [];

    if (Object.keys(topPatch).length > 0) {
      requests.push(
        fetch(shopPath('state.json'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(topPatch)
        })
      );
    }

    if (workPatch) {
      requests.push(
        fetch(shopPath('state/work.json'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workPatch)
        })
      );
    }

    const results = await Promise.all(requests);
    for (const res of results) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
    }

    // Mark pushed keys as clean
    for (const k of changed) {
      lastPushedJson[k] = JSON.stringify(state[k], replacer);
    }
    updateSyncBadge('Synced', true);
  } catch (err) {
    updateSyncBadge('Sync Error', false);
    // Keys remain dirty - next push will retry them
    scheduleSync();
  } finally {
    syncInFlight = false;
    // If new changes accumulated during push, schedule another
    if (getChangedKeys().length > 0) {
      scheduleSync();
    }
  }
}

// === MERGE UTILITIES ===

/** Merge two arrays by `id` field - returns the union, local wins on conflict */
function mergeById(local, remote) {
  if (!Array.isArray(local)) local = [];
  if (!Array.isArray(remote)) remote = [];
  const map = new Map();
  for (const item of remote) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of local) {
    if (item && item.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

/** Firebase may turn sparse arrays into objects - normalize to array */
function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
}

/** Deep-merge work for all employees - union entries & logs by ID */
function mergeWork(local, remote) {
  if (!local || typeof local !== 'object') return remote || {};
  if (!remote || typeof remote !== 'object') return local || {};

  const merged = {};
  const allIds = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const empId of allIds) {
    const l = local[empId];
    const r = remote[empId];
    if (!l) { merged[empId] = r; continue; }
    if (!r) { merged[empId] = l; continue; }

    merged[empId] = {
      // Inventory counts: local wins (person at the counter is authoritative)
      inventory: { ...(r.inventory || {}), ...(l.inventory || {}) },
      // Entries & logs: union by ID preserves work from both tabs
      entries: mergeById(ensureArray(l.entries), ensureArray(r.entries)),
      inventoryLog: mergeById(ensureArray(l.inventoryLog), ensureArray(r.inventoryLog))
    };
  }
  return merged;
}

/** Returns true if the merged work contains entries the remote version lacked */
function workNeedsResync(merged, remote) {
  if (!remote || typeof remote !== 'object') return false;
  for (const empId of Object.keys(remote)) {
    const m = merged[empId];
    const r = remote[empId];
    if (!m || !r) continue;
    if ((m.entries || []).length > ensureArray(r.entries).length) return true;
    if ((m.inventoryLog || []).length > ensureArray(r.inventoryLog).length) return true;
  }
  return false;
}

// === APPLY REMOTE DATA (merge-based - replaces the old overwrite approach) ===
function applyRemoteData(remoteData) {
  if (!remoteData || typeof remoteData !== 'object') return;

  const keysToResync = new Set();
  let anyChange = false;

  // Deep-merge work - preserves locally-added entries from both tabs
  if (remoteData.work !== undefined) {
    const before = JSON.stringify(state.work, replacer);
    const merged = mergeWork(state.work || {}, remoteData.work || {});
    if (workNeedsResync(merged, remoteData.work)) keysToResync.add('work');
    state.work = merged;
    if (JSON.stringify(state.work, replacer) !== before) anyChange = true;
  }

  // Merge append-only collections by ID (activity log, payout history)
  for (const k of ['activityLog', 'payoutHistory']) {
    if (remoteData[k] !== undefined) {
      const before = JSON.stringify(state[k], replacer);
      const remote = ensureArray(remoteData[k]);
      const merged = mergeById(state[k] || [], remote);
      if (merged.length > remote.length) keysToResync.add(k);
      state[k] = merged;
      if (JSON.stringify(state[k], replacer) !== before) anyChange = true;
    }
  }

  // Accept remote as truth for everything else (settings, employees, etc.)
  for (const k of Object.keys(remoteData)) {
    if (LOCAL_KEYS.has(k)) continue;
    if (k === 'work' || k === 'activityLog' || k === 'payoutHistory') continue;
    const before = JSON.stringify(state[k], replacer);
    state[k] = remoteData[k];
    if (JSON.stringify(state[k], replacer) !== before) anyChange = true;
  }

  // Update snapshot for keys that are in sync - but NOT for keys that
  // still have local extras that need pushing back to the server.
  for (const k of Object.keys(state)) {
    if (!LOCAL_KEYS.has(k) && !keysToResync.has(k)) {
      lastPushedJson[k] = JSON.stringify(state[k], replacer);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  // Only re-render if something actually changed locally
  if (anyChange && onRemoteData) onRemoteData();
  updateSyncBadge('Synced', true);

  // If local state had entries the server didn't, push them out
  if (keysToResync.size > 0) {
    scheduleSync();
  }
}

// === REAL-TIME STREAMING (SSE) ===
let eventSource = null;

export function startStreaming() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(shopPath('state.json'));

  function handleEvent(e) {
    try {
      const msg = JSON.parse(e.data);
      if (msg.data === null || msg.data === undefined) return;

      if (msg.path === '/') {
        // Top-level update (full state or partial PATCH at root)
        applyRemoteData(msg.data);
      } else if (msg.path.startsWith('/')) {
        // Sub-path update (e.g. /work or /work/emp1) - wrap in partial object
        const parts = msg.path.split('/').filter(Boolean);
        let partial = {};
        let obj = partial;
        for (let i = 0; i < parts.length - 1; i++) {
          obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = msg.data;
        applyRemoteData(partial);
      }
    } catch { /* ignore parse errors */ }
  }

  eventSource.addEventListener('put', handleEvent);
  eventSource.addEventListener('patch', handleEvent);

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
