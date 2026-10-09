import { uid } from './utils.js';
import { scheduleSync } from './firebase.js';
import { shopId } from './shop.js';

// === DEFAULT DATA ===
const DEFAULT_ROLES = [
  { id: 'owner', name: 'Owner', commission: 0, color: '#22c55e' },
  { id: 'head_manager', name: 'Head Manager', commission: 50, color: '#7c3aed' },
  { id: 'manager', name: 'Manager', commission: 45, color: '#eab308' },
  { id: 'master_tech', name: 'Master Tech', commission: 40, color: '#06b6d4' },
  { id: 'senior_mechanic', name: 'Senior Mechanic', commission: 30, color: '#f97316' },
  { id: 'mechanic', name: 'Mechanic', commission: 25, color: '#94a3b8' }
];

const DEFAULT_SERVICE_GROUPS = [
  { id: 'government', name: 'Government', color: '#6b7280', sortOrder: 0 },
  { id: 'services',   name: 'Services',   color: '#3b82f6', sortOrder: 1 },
  { id: 'upgrades',   name: 'Upgrades',   color: '#a855f7', sortOrder: 2 },
  { id: 'packages',   name: 'Packages',   color: '#f59e0b', sortOrder: 3 }
];

const DEFAULT_SERVICES = [
  { id: 'lockpick', name: 'Lockpick', price: 25, eventPrice: 13, commission: 0, category: 'inventory', group: '' },
  { id: 'clean_kit', name: 'Clean Kit', price: 25, eventPrice: 13, commission: 0, category: 'inventory', group: '' },
  { id: 'repair_kit', name: 'Repair Kit', price: 100, eventPrice: 50, commission: 0, category: 'inventory', group: '' },
  { id: 'adv_repair_kit', name: 'Adv. Repair Kit', price: 250, eventPrice: 125, commission: 0, category: 'inventory', group: '' },
  { id: 'body_repair', name: 'Body Repair', price: 50, eventPrice: 25, commission: 0, category: 'service', group: 'services' },

  { id: 'city_tow', name: 'City Tow', price: 700, eventPrice: 350, commission: 0, category: 'service', group: 'services' },
  { id: 'county_tow', name: 'County Tow', price: 900, eventPrice: 450, commission: 0, category: 'service', group: 'services' },
  { id: 'internals', name: 'Internals', price: 500, eventPrice: 350, commission: 0, category: 'service', group: 'services' },
  { id: 'hg_internals', name: 'HG Internals', price: 1000, eventPrice: 450, commission: 0, category: 'service', group: 'services' },
  { id: 'engine_upgrade', name: 'Engine Upgrade', price: 2500, eventPrice: 250, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'brake_upgrade', name: 'Brake Upgrade', price: 2500, eventPrice: 500, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'trans_upgrade', name: 'Transmission Upgrade', price: 2500, eventPrice: 1250, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'sus_upgrade', name: 'Suspension Upgrade', price: 2500, eventPrice: 1250, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'license_plate', name: 'License Plate', price: 4000, eventPrice: 1250, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'turbo', name: 'Turbo', price: 5000, eventPrice: 1250, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'harness', name: 'Harness', price: 5000, eventPrice: 2000, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'killswitch', name: 'Killswitch', price: 5000, eventPrice: 2500, commission: 0, category: 'service', group: 'upgrades' },
  { id: 'employee_upgrade', name: 'Employee Upgrade', price: 7500, eventPrice: 2500, commission: 0, category: 'service', group: 'packages' },
  { id: 'max_upgrade', name: 'Max Upgrade', price: 10000, eventPrice: 2500, commission: 0, category: 'service', group: 'packages' },
  { id: 'suspension_work', name: 'Suspension Work', price: 25000, eventPrice: 3750, commission: 0, category: 'service', group: 'packages' }
];

const DEFAULT_EMPLOYEES = [];

// === PERSISTENCE ===
export const STORAGE_KEY = shopId ? `commission_tracker_${shopId}` : 'commission_tracker';
export const LOCAL_KEYS = new Set(['selectedEmployeeId', 'employeeFilter']);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

const saved = loadState();
export const state = saved || {
  roles: structuredClone(DEFAULT_ROLES),
  services: structuredClone(DEFAULT_SERVICES),
  serviceGroups: structuredClone(DEFAULT_SERVICE_GROUPS),
  employees: DEFAULT_EMPLOYEES,
  work: {},
  eventMode: false,
  selectedEmployeeId: null,
  employeeFilter: 'active'
};

// Migrations
if (!state.work) state.work = {};
if (!state.workClears || typeof state.workClears !== 'object') state.workClears = {};
for (const emp of state.employees) {
  if (!emp.joinDate) emp.joinDate = Date.now();
}
if (!Array.isArray(state.activityLog)) state.activityLog = [];
if (!Array.isArray(state.payoutHistory)) state.payoutHistory = [];
if (state.shopName === undefined) state.shopName = '';
if (state.shopLogo === undefined) state.shopLogo = '';
if (state.customizeEnabled === undefined) state.customizeEnabled = true;
delete state.sheetsConfig;

// Migrate: add serviceGroups if missing
if (!Array.isArray(state.serviceGroups)) {
  state.serviceGroups = structuredClone(DEFAULT_SERVICE_GROUPS);
}
// Migrate: assign group to services that don't have one
for (const svc of state.services) {
  if (!svc.group && svc.group !== '') {
    if (svc.category === 'inventory') {
      svc.group = '';
    } else if (svc.price === 0) {
      svc.group = 'government';
    } else if (svc.price <= 1000) {
      svc.group = 'services';
    } else if (svc.price <= 5000) {
      svc.group = 'upgrades';
    } else {
      svc.group = 'packages';
    }
  }
}

// === SAVE ===
export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSync();
}

// === ACTIVITY LOGGING ===
const ACTIVITY_BATCH_WINDOW = 60000;
const MAX_ACTIVITY_ITEMS = 50;

export function logActivity(entry) {
  if (!Array.isArray(state.activityLog)) state.activityLog = [];
  entry.id = entry.id || uid();
  entry.timestamp = entry.timestamp || Date.now();

  // Batch inventory add/remove within 1-minute window
  if (entry.type === 'inventory' || entry.type === 'inv-remove') {
    const recent = state.activityLog.find(
      log => log.type === entry.type
        && log.empId === entry.empId
        && log.serviceId === entry.serviceId
        && (entry.timestamp - log.timestamp) < ACTIVITY_BATCH_WINDOW
    );
    if (recent) {
      recent.quantity += entry.quantity;
      if (recent.quantity <= 0) {
        state.activityLog = state.activityLog.filter(l => l.id !== recent.id);
      }
      return;
    }
  }

  state.activityLog.push(entry);

  // Trim to rolling 50
  if (state.activityLog.length > MAX_ACTIVITY_ITEMS) {
    state.activityLog = state.activityLog.slice(-MAX_ACTIVITY_ITEMS);
  }
}

// === GETTERS ===
export function getRole(roleId) {
  return state.roles.find(r => r.id === roleId);
}

export function getService(serviceId) {
  return state.services.find(s => s.id === serviceId);
}

export function getServiceGroup(groupId) {
  return state.serviceGroups.find(g => g.id === groupId);
}

export function getServicePrice(serviceId) {
  const svc = getService(serviceId);
  if (!svc) return 0;
  return state.eventMode ? (svc.eventPrice ?? svc.price) : svc.price;
}

export function isFlatPayout(svc) {
  return !!svc && svc.category === 'flat';
}

// Fixed payout for a flat-payout item (ignores event pricing and role rate)
export function getFlatPayout(serviceId) {
  const svc = getService(serviceId);
  return isFlatPayout(svc) ? (svc.price || 0) : 0;
}

/** Sale value a single work entry contributes to gross (flat payouts are not sales) */
export function getEntrySale(entry) {
  if (entry.type === 'customize') return entry.amount || 0;
  if (isFlatPayout(getService(entry.serviceId))) return 0;
  return getServicePrice(entry.serviceId);
}

export function getEmployeeWork(empId) {
  if (!state.work[empId]) {
    state.work[empId] = { inventory: {}, entries: [] };
  }
  const w = state.work[empId];
  if (!w.inventory || typeof w.inventory !== 'object') w.inventory = {};
  if (!Array.isArray(w.entries)) w.entries = [];
  if (!Array.isArray(w.inventoryLog)) w.inventoryLog = [];
  return w;
}

/** Returns the clear timestamp for an employee (0 if never cleared) */
export function getWorkClearTime(empId) {
  return (state.workClears && state.workClears[empId]) || 0;
}

/**
 * Read-only filtered view of employee work — hides entries older than
 * the last clear. Use for calculations and rendering. Does NOT mutate state.
 */
export function getEmployeeWorkView(empId) {
  const w = getEmployeeWork(empId);
  const clearTs = getWorkClearTime(empId);
  if (!clearTs) return w;

  const entries = w.entries.filter(e => (e.timestamp || 0) > clearTs);
  const inventoryLog = w.inventoryLog.filter(l => (l.timestamp || 0) > clearTs);

  // If everything is stale, inventory is also stale
  if (entries.length === 0 && inventoryLog.length === 0) {
    return { inventory: {}, entries: [], inventoryLog: [] };
  }

  // Rebuild inventory from post-clear logs only
  const inventory = {};
  for (const log of inventoryLog) {
    inventory[log.serviceId] = (inventory[log.serviceId] || 0) + (log.quantity || 0);
  }
  return { inventory, entries, inventoryLog };
}

// === CALCULATIONS ===
export function calcEmployeeSales(empId) {
  const work = getEmployeeWorkView(empId);
  let total = 0;
  for (const [svcId, qty] of Object.entries(work.inventory)) {
    total += getServicePrice(svcId) * qty;
  }
  for (const entry of work.entries) {
    total += getEntrySale(entry);
  }
  return total;
}

export function calcEmployeeCommission(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return 0;
  const role = getRole(emp.roleId);
  const rate = role ? role.commission / 100 : 0;
  const work = getEmployeeWorkView(empId);
  let total = 0;
  for (const [svcId, qty] of Object.entries(work.inventory)) {
    const svc = state.services.find(s => s.id === svcId);
    const flat = svc ? (svc.commission || 0) : 0;
    if (flat > 0) {
      total += flat * qty * rate;
    } else {
      total += getServicePrice(svcId) * qty * rate;
    }
  }
  for (const entry of work.entries) {
    if (entry.type === 'customize') {
      total += (entry.amount || 0) * rate;
    } else {
      const svc = state.services.find(s => s.id === entry.serviceId);
      if (isFlatPayout(svc)) {
        total += svc.price || 0;
        continue;
      }
      const flat = svc ? (svc.commission || 0) : 0;
      if (flat > 0) {
        total += flat * rate;
      } else {
        total += getServicePrice(entry.serviceId) * rate;
      }
    }
  }
  return total;
}

/** Total flat payouts (already included in calcEmployeeCommission) */
export function calcEmployeeFlatPayout(empId) {
  const work = getEmployeeWorkView(empId);
  let total = 0;
  for (const entry of work.entries) {
    if (entry.type !== 'customize') total += getFlatPayout(entry.serviceId);
  }
  return total;
}

export function calcEmployeeServiceCount(empId) {
  const work = getEmployeeWorkView(empId);
  let count = 0;
  for (const qty of Object.values(work.inventory)) count += qty;
  count += work.entries.length;
  return count;
}
