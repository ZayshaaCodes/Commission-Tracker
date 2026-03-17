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
  { id: 'lockpick', name: 'Lockpick', price: 25, eventPrice: 13, category: 'inventory', group: '' },
  { id: 'clean_kit', name: 'Clean Kit', price: 25, eventPrice: 13, category: 'inventory', group: '' },
  { id: 'repair_kit', name: 'Repair Kit', price: 100, eventPrice: 50, category: 'inventory', group: '' },
  { id: 'adv_repair_kit', name: 'Adv. Repair Kit', price: 250, eventPrice: 125, category: 'inventory', group: '' },
  { id: 'body_repair', name: 'Body Repair', price: 50, eventPrice: 25, category: 'service', group: 'services' },

  { id: 'city_tow', name: 'City Tow', price: 700, eventPrice: 350, category: 'service', group: 'services' },
  { id: 'county_tow', name: 'County Tow', price: 900, eventPrice: 450, category: 'service', group: 'services' },
  { id: 'internals', name: 'Internals', price: 500, eventPrice: 350, category: 'service', group: 'services' },
  { id: 'hg_internals', name: 'HG Internals', price: 1000, eventPrice: 450, category: 'service', group: 'services' },
  { id: 'engine_upgrade', name: 'Engine Upgrade', price: 2500, eventPrice: 250, category: 'service', group: 'upgrades' },
  { id: 'brake_upgrade', name: 'Brake Upgrade', price: 2500, eventPrice: 500, category: 'service', group: 'upgrades' },
  { id: 'trans_upgrade', name: 'Transmission Upgrade', price: 2500, eventPrice: 1250, category: 'service', group: 'upgrades' },
  { id: 'sus_upgrade', name: 'Suspension Upgrade', price: 2500, eventPrice: 1250, category: 'service', group: 'upgrades' },
  { id: 'license_plate', name: 'License Plate', price: 4000, eventPrice: 1250, category: 'service', group: 'upgrades' },
  { id: 'turbo', name: 'Turbo', price: 5000, eventPrice: 1250, category: 'service', group: 'upgrades' },
  { id: 'harness', name: 'Harness', price: 5000, eventPrice: 2000, category: 'service', group: 'upgrades' },
  { id: 'killswitch', name: 'Killswitch', price: 5000, eventPrice: 2500, category: 'service', group: 'upgrades' },
  { id: 'employee_upgrade', name: 'Employee Upgrade', price: 7500, eventPrice: 2500, category: 'service', group: 'packages' },
  { id: 'max_upgrade', name: 'Max Upgrade', price: 10000, eventPrice: 2500, category: 'service', group: 'packages' },
  { id: 'suspension_work', name: 'Suspension Work', price: 25000, eventPrice: 3750, category: 'service', group: 'packages' }
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
for (const emp of state.employees) {
  if (!emp.joinDate) emp.joinDate = Date.now();
}
if (!Array.isArray(state.activityLog)) state.activityLog = [];
if (!Array.isArray(state.payoutHistory)) state.payoutHistory = [];
if (state.shopName === undefined) state.shopName = '';
if (state.shopLogo === undefined) state.shopLogo = '';
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

// === CALCULATIONS ===
export function calcEmployeeSales(empId) {
  const work = getEmployeeWork(empId);
  let total = 0;
  for (const [svcId, qty] of Object.entries(work.inventory)) {
    total += getServicePrice(svcId) * qty;
  }
  for (const entry of work.entries) {
    total += getServicePrice(entry.serviceId);
  }
  return total;
}

export function calcEmployeeCommission(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return 0;
  const role = getRole(emp.roleId);
  const rate = role ? role.commission / 100 : 0;
  return calcEmployeeSales(empId) * rate;
}

export function calcEmployeeServiceCount(empId) {
  const work = getEmployeeWork(empId);
  let count = 0;
  for (const qty of Object.values(work.inventory)) count += qty;
  count += work.entries.length;
  return count;
}
