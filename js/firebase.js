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

// Version counter — incremented on every successful push.
// Used to detect when the server is ahead (another client pushed).
let knownVersion = 0;

// Collections that should be merged by `id` field instead of overwritten.
const MERGE_BY_ID_KEYS = new Set(['employees', 'services', 'roles', 'serviceGroups', 'payoutHistory']);

export function markInitialLoadDone() { initialLoadDone = true; }

export function onRemoteUpdate(fn) { onRemoteData = fn; }

export function scheduleSync() {
  if (!initialLoadDone) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushToFirebase(), 600);
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
      // Capture server version
      knownVersion = data._version || 0;

      // Merge ID-based collections (employees, roles, etc.) — local wins on
      // conflicts so that unpushed changes (e.g. toggling inactive) survive.
      for (const k of MERGE_BY_ID_KEYS) {
        if (data[k] !== undefined) {
          const remote = ensureArray(data[k]);
          const local = ensureArray(state[k]);
          state[k] = mergeByIdOrdered(local, remote);
        }
      }

      // Activity log: remote-authoritative merge (respects deletions from DB)
      if (data.activityLog !== undefined) {
        state.activityLog = mergeActivityLog(
          ensureArray(state.activityLog), ensureArray(data.activityLog)
        );
      }

      // Merge workClears BEFORE work so pruning uses up-to-date timestamps
      if (data.workClears !== undefined) {
        state.workClears = mergeWorkClears(state.workClears, data.workClears);
      }

      // Work: on initial load, accept remote as authoritative.
      // Any locally-cached work from a previous session that wasn't pushed
      // should not override the server's version.
      if (data.work !== undefined) {
        state.work = data.work || {};
      }
      pruneStaleWork();

      // For all other keys, accept the server value
      for (const k of Object.keys(data)) {
        if (LOCAL_KEYS.has(k) || MERGE_BY_ID_KEYS.has(k) || k === 'work' || k === 'workClears' || k === '_version') continue;
        state[k] = data[k];
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

// === PUSH (version-checked, merge-before-push) ===
export async function pushToFirebase() {
  if (syncInFlight || !initialLoadDone) return;

  const changed = getChangedKeys();
  if (changed.length === 0) return;

  syncInFlight = true;
  try {
    updateSyncBadge('Saving...', false);

    // 1) Check server version — if ahead, fetch + merge first
    const verRes = await fetch(shopPath('state/_version.json'));
    if (verRes.ok) {
      const serverVer = (await verRes.json()) || 0;
      if (serverVer > knownVersion) {
        // Server is ahead — another client pushed. Fetch full state and merge.
        const fullRes = await fetch(shopPath('state.json'));
        if (fullRes.ok) {
          const serverData = await fullRes.json();
          if (serverData) {
            mergeServerState(serverData);
            knownVersion = serverData._version || serverVer;
          }
        }
      }
    }

    // 2) Re-check what's still dirty after the merge
    const stillChanged = getChangedKeys();
    if (stillChanged.length === 0) {
      updateSyncBadge('Synced', true);
      return;
    }

    // 3) Increment version and push
    const newVersion = knownVersion + 1;
    state._version = newVersion;

    const topPatch = { _version: newVersion };
    let workPatch = null;
    let workClearsPatch = null;

    for (const k of stillChanged) {
      if (k === '_version') continue;
      const val = JSON.parse(JSON.stringify(state[k], replacer));
      if (k === 'work') {
        workPatch = val;
      } else if (k === 'workClears') {
        workClearsPatch = val;
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

    // Push workClears at its own path so Firebase shallow-merges per employee
    // — old clients can't overwrite this because they never touch /state/workClears
    if (workClearsPatch) {
      requests.push(
        fetch(shopPath('state/workClears.json'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workClearsPatch)
        })
      );
    }

    const results = await Promise.all(requests);
    for (const res of results) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
    }

    // Mark pushed keys as clean and update known version
    knownVersion = newVersion;
    for (const k of stillChanged) {
      lastPushedJson[k] = JSON.stringify(state[k], replacer);
    }
    lastPushedJson['_version'] = JSON.stringify(newVersion);
    updateSyncBadge('Synced', true);
  } catch (err) {
    updateSyncBadge('Sync Error', false);
    scheduleSync();
  } finally {
    syncInFlight = false;
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

/**
 * Merge activity logs — remote is authoritative for deletions.
 * Local-only items are kept only if they're genuinely new (created after
 * the latest remote item), preventing deleted entries from being resurrected.
 * Result is capped at 50 items (rolling log).
 */
function mergeActivityLog(local, remote) {
  local = ensureArray(local);
  remote = ensureArray(remote);
  const remoteIds = new Set(remote.map(i => i?.id).filter(Boolean));
  const remoteMaxTs = remote.reduce((m, i) => Math.max(m, i?.timestamp || 0), 0);
  // Start with all remote items
  const result = [...remote];
  // Add local-only items that are genuinely new (created after latest remote item)
  for (const item of local) {
    if (item?.id && !remoteIds.has(item.id) && (item.timestamp || 0) > remoteMaxTs) {
      result.push(item);
    }
  }
  result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return result.slice(-50);
}

/**
 * Merge two arrays by `id`, preserving the ORDER from `base` for items
 * that exist in both, appending new-only items at the end.
 * `winner` array's fields win on conflict (local or remote depending on caller).
 */
function mergeByIdOrdered(winner, base) {
  winner = ensureArray(winner);
  base = ensureArray(base);
  const winnerMap = new Map();
  for (const item of winner) {
    if (item && item.id) winnerMap.set(item.id, item);
  }
  const baseMap = new Map();
  for (const item of base) {
    if (item && item.id) baseMap.set(item.id, item);
  }
  // Start with base order, preferring winner's version of each item
  const result = [];
  const seen = new Set();
  for (const item of base) {
    if (!item || !item.id) continue;
    seen.add(item.id);
    result.push(winnerMap.get(item.id) || item);
  }
  // Append items only in winner (new additions)
  for (const item of winner) {
    if (item && item.id && !seen.has(item.id)) {
      result.push(item);
    }
  }
  return result;
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
      inventory: { ...(r.inventory || {}), ...(l.inventory || {}) },
      entries: mergeById(ensureArray(l.entries), ensureArray(r.entries)),
      inventoryLog: mergeById(ensureArray(l.inventoryLog), ensureArray(r.inventoryLog)),
    };
  }
  return merged;
}

/** Merge workClears maps — always keep the highest (most recent) timestamp per employee */
function mergeWorkClears(local, remote) {
  const l = (local && typeof local === 'object') ? local : {};
  const r = (remote && typeof remote === 'object') ? remote : {};
  const merged = { ...l };
  for (const empId of Object.keys(r)) {
    merged[empId] = Math.max(merged[empId] || 0, r[empId] || 0);
  }
  return merged;
}

/**
 * Remove work entries older than each employee's workClears timestamp.
 * This prevents stale data from accumulating after merges.
 */
function pruneStaleWork() {
  if (!state.workClears || !state.work) return;
  for (const empId of Object.keys(state.workClears)) {
    const clearTs = state.workClears[empId];
    if (!clearTs || !state.work[empId]) continue;
    const w = state.work[empId];
    if (Array.isArray(w.entries)) {
      w.entries = w.entries.filter(e => (e.timestamp || 0) > clearTs);
    }
    if (Array.isArray(w.inventoryLog)) {
      w.inventoryLog = w.inventoryLog.filter(l => (l.timestamp || 0) > clearTs);
    }
    // Rebuild inventory from remaining logs only
    const inv = {};
    for (const log of (w.inventoryLog || [])) {
      inv[log.serviceId] = (inv[log.serviceId] || 0) + (log.quantity || 0);
    }
    w.inventory = inv;
  }
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

// === MERGE SERVER STATE (called before push when server is ahead) ===
// Merges the full server snapshot into local state. Local wins on field conflicts
// for items that exist in both, but new server items are added.
function mergeServerState(serverData) {
  if (!serverData || typeof serverData !== 'object') return;

  // Merge workClears BEFORE work so pruning uses up-to-date timestamps
  if (serverData.workClears !== undefined) {
    state.workClears = mergeWorkClears(state.workClears, serverData.workClears);
  }

  // Work: per-employee clean/dirty check. Accept remote for employees
  // the user hasn't touched, keep local for employees with pending edits.
  if (serverData.work !== undefined) {
    const remoteWork = serverData.work || {};
    if (!state.work) state.work = {};

    const lastPushedWork = lastPushedJson['work']
      ? JSON.parse(lastPushedJson['work']) : {};

    for (const empId of Object.keys(remoteWork)) {
      const localEmpJson = JSON.stringify(state.work[empId], replacer);
      const lastPushedEmpJson = JSON.stringify(lastPushedWork[empId], replacer);
      if (localEmpJson === lastPushedEmpJson) {
        // Clean locally — accept remote version
        state.work[empId] = remoteWork[empId];
      }
      // else: keep local — user edited this employee's work
    }
  }
  pruneStaleWork();

  // Merge ID-based collections — if local is unchanged, accept remote as
  // truth (supports deletions). Only merge when local has pending edits.
  for (const k of MERGE_BY_ID_KEYS) {
    if (serverData[k] !== undefined) {
      const remote = ensureArray(serverData[k]);
      const localJson = JSON.stringify(state[k], replacer);
      if (localJson === lastPushedJson[k]) {
        state[k] = remote;
      } else {
        const local = ensureArray(state[k]);
        state[k] = mergeByIdOrdered(local, remote);
      }
    }
  }

  // Activity log: remote-authoritative merge
  if (serverData.activityLog !== undefined) {
    state.activityLog = mergeActivityLog(
      ensureArray(state.activityLog), ensureArray(serverData.activityLog)
    );
  }

  // For non-collection keys, keep local if dirty, otherwise accept server
  for (const k of Object.keys(serverData)) {
    if (LOCAL_KEYS.has(k) || k === 'work' || k === 'workClears' || MERGE_BY_ID_KEYS.has(k)) continue;
    if (k === '_version') continue;
    // If we haven't changed this key locally, accept the server value
    const localJson = JSON.stringify(state[k], replacer);
    if (localJson === lastPushedJson[k]) {
      state[k] = serverData[k];
    }
    // Otherwise keep local (our change wins for scalar keys)
  }

  // Update snapshots for keys we accepted from server
  snapshotAllKeys();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// === APPLY REMOTE DATA (SSE events — merge-based) ===
function applyRemoteData(remoteData) {
  if (!remoteData || typeof remoteData !== 'object') return;

  const keysToResync = new Set();
  let anyChange = false;

  // Track version
  if (remoteData._version !== undefined) {
    const rv = remoteData._version || 0;
    if (rv > knownVersion) knownVersion = rv;
  }

  // Merge workClears BEFORE work so pruning uses up-to-date timestamps
  if (remoteData.workClears !== undefined) {
    const before = JSON.stringify(state.workClears, replacer);
    state.workClears = mergeWorkClears(state.workClears, remoteData.workClears);
    if (JSON.stringify(state.workClears, replacer) !== before) anyChange = true;
  }

  // Work: for each employee in the remote data, accept remote as truth if
  // that employee's local work is clean. If dirty, keep local and push it.
  // This handles both full state updates and partial SSE updates correctly.
  if (remoteData.work !== undefined) {
    const before = JSON.stringify(state.work, replacer);
    const remoteWork = remoteData.work || {};
    if (!state.work) state.work = {};

    const lastPushedWork = lastPushedJson['work']
      ? JSON.parse(lastPushedJson['work']) : {};

    for (const empId of Object.keys(remoteWork)) {
      const localEmpJson = JSON.stringify(state.work[empId], replacer);
      const lastPushedEmpJson = JSON.stringify(lastPushedWork[empId], replacer);
      if (localEmpJson === lastPushedEmpJson) {
        // This employee's work is clean locally — accept remote
        state.work[empId] = remoteWork[empId];
      } else {
        // This employee's work has local edits — keep local, push later
        keysToResync.add('work');
      }
    }
    pruneStaleWork();
    if (JSON.stringify(state.work, replacer) !== before) anyChange = true;
  }

  // Merge ID-based collections — if local is unchanged, accept remote as
  // truth (supports deletions). Only merge when local has pending edits.
  for (const k of MERGE_BY_ID_KEYS) {
    if (remoteData[k] !== undefined) {
      const before = JSON.stringify(state[k], replacer);
      const remote = ensureArray(remoteData[k]);
      const localJson = JSON.stringify(state[k], replacer);
      if (localJson === lastPushedJson[k]) {
        // Local hasn't changed — accept remote as truth (allows deletions)
        state[k] = remote;
      } else {
        // Local has pending edits — merge (preserves local additions)
        const local = ensureArray(state[k]);
        const merged = mergeByIdOrdered(local, remote);
        if (merged.length > remote.length) keysToResync.add(k);
        state[k] = merged;
      }
      if (JSON.stringify(state[k], replacer) !== before) anyChange = true;
    }
  }

  // Activity log: remote-authoritative merge (no resync for deletions)
  if (remoteData.activityLog !== undefined) {
    const before = JSON.stringify(state.activityLog, replacer);
    state.activityLog = mergeActivityLog(
      ensureArray(state.activityLog), ensureArray(remoteData.activityLog)
    );
    if (JSON.stringify(state.activityLog, replacer) !== before) anyChange = true;
  }

  // Accept remote as truth for non-collection keys (scalars, settings)
  for (const k of Object.keys(remoteData)) {
    if (LOCAL_KEYS.has(k)) continue;
    if (k === 'work' || k === 'workClears' || k === '_version' || MERGE_BY_ID_KEYS.has(k)) continue;
    const before = JSON.stringify(state[k], replacer);
    state[k] = remoteData[k];
    if (JSON.stringify(state[k], replacer) !== before) anyChange = true;
  }

  // Update snapshot for keys that are in sync
  for (const k of Object.keys(state)) {
    if (!LOCAL_KEYS.has(k) && !keysToResync.has(k)) {
      lastPushedJson[k] = JSON.stringify(state[k], replacer);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (anyChange && onRemoteData) onRemoteData();
  updateSyncBadge('Synced', true);

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
