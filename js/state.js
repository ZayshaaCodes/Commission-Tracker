import { uid } from './utils.js';
import { scheduleSync } from './firebase.js';

// === DEFAULT DATA ===
const DEFAULT_ROLES = [
  { id: 'owner', name: 'Owner', commission: 0, color: '#22c55e' },
  { id: 'head_manager', name: 'Head Manager', commission: 50, color: '#7c3aed' },
  { id: 'manager', name: 'Manager', commission: 45, color: '#eab308' },
  { id: 'master_tech', name: 'Master Tech', commission: 40, color: '#06b6d4' },
  { id: 'senior_mechanic', name: 'Senior Mechanic', commission: 30, color: '#f97316' },
  { id: 'mechanic', name: 'Mechanic', commission: 25, color: '#94a3b8' }
];

const DEFAULT_SERVICES = [
  { id: 'lockpick', name: 'Lockpick', price: 25, eventPrice: 13, category: 'inventory' },
  { id: 'clean_kit', name: 'Clean Kit', price: 25, eventPrice: 13, category: 'inventory' },
  { id: 'repair_kit', name: 'Repair Kit', price: 100, eventPrice: 50, category: 'inventory' },
  { id: 'adv_repair_kit', name: 'Adv. Repair Kit', price: 250, eventPrice: 125, category: 'inventory' },
  { id: 'body_repair', name: 'Body Repair', price: 50, eventPrice: 25, category: 'service' },

  { id: 'city_tow', name: 'City Tow', price: 700, eventPrice: 350, category: 'service' },
  { id: 'county_tow', name: 'County Tow', price: 900, eventPrice: 450, category: 'service' },
  { id: 'internals', name: 'Internals', price: 500, eventPrice: 350, category: 'service' },
  { id: 'hg_internals', name: 'HG Internals', price: 1000, eventPrice: 450, category: 'service' },
  { id: 'engine_upgrade', name: 'Engine Upgrade', price: 2500, eventPrice: 250, category: 'service' },
  { id: 'brake_upgrade', name: 'Brake Upgrade', price: 2500, eventPrice: 500, category: 'service' },
  { id: 'trans_upgrade', name: 'Transmission Upgrade', price: 2500, eventPrice: 1250, category: 'service' },
  { id: 'sus_upgrade', name: 'Suspension Upgrade', price: 2500, eventPrice: 1250, category: 'service' },
  { id: 'license_plate', name: 'License Plate', price: 4000, eventPrice: 1250, category: 'service' },
  { id: 'turbo', name: 'Turbo', price: 5000, eventPrice: 1250, category: 'service' },
  { id: 'harness', name: 'Harness', price: 5000, eventPrice: 2000, category: 'service' },
  { id: 'killswitch', name: 'Killswitch', price: 5000, eventPrice: 2500, category: 'service' },
  { id: 'employee_upgrade', name: 'Employee Upgrade', price: 7500, eventPrice: 2500, category: 'service' },
  { id: 'max_upgrade', name: 'Max Upgrade', price: 10000, eventPrice: 2500, category: 'service' },
  { id: 'suspension_work', name: 'Suspension Work', price: 25000, eventPrice: 3750, category: 'service' }
];

const DEFAULT_EMPLOYEES = [
  { id: uid(), name: 'Cara Wobbles', stateId: '1434', roleId: 'owner', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Trey Miller', stateId: '3654', roleId: 'owner', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Axle Waxle', stateId: '901', roleId: 'head_manager', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Rod Blackwash', stateId: '1250', roleId: 'head_manager', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Jeff', stateId: '468', roleId: 'head_manager', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Dan Sanders', stateId: '1743', roleId: 'manager', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Nathan Black', stateId: '888', roleId: 'manager', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Shawn Howard', stateId: '4357', roleId: 'manager', active: true, joinDate: Date.now() },
  { id: uid(), name: 'Brett Wescott', stateId: '5141', roleId: 'master_tech', active: true, joinDate: Date.now() }
];

// === PERSISTENCE ===
export const STORAGE_KEY = 'saa_commission_tracker';
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
delete state.sheetsConfig;

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
