import { state, getRole, calcEmployeeSales, calcEmployeeCommission,
         calcEmployeeServiceCount, saveState } from './state.js?v=20260321';

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCsv() {
  const rows = [['Employee', 'Role', 'State ID', 'Gross Sales', 'Commission %', 'Commission $', 'Net Sales', 'Services', 'Status']];

  for (const emp of state.employees) {
    const role = getRole(emp.roleId);
    const sales = calcEmployeeSales(emp.id);
    const comm = calcEmployeeCommission(emp.id);
    rows.push([
      emp.name,
      role ? role.name : '',
      emp.stateId,
      sales,
      role ? role.commission : 0,
      comm.toFixed(2),
      (sales - comm).toFixed(2),
      calcEmployeeServiceCount(emp.id),
      emp.active ? 'Active' : 'Inactive'
    ]);
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadFile(csv, 'commissions.csv', 'text/csv');
}

export function exportJson() {
  const json = JSON.stringify(state, null, 2);
  downloadFile(json, 'commission-data.json', 'application/json');
}

export function importJson(file, onComplete) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.employees) || !Array.isArray(data.services) || !Array.isArray(data.roles)) {
        alert('Invalid data file format.');
        return;
      }

      // Whitelist allowed top-level keys
      const ALLOWED = new Set([
        'employees', 'services', 'roles', 'work', 'eventMode',
        'selectedEmployeeId', 'employeeFilter', 'activityLog', 'payoutHistory'
      ]);
      for (const key of Object.keys(data)) {
        if (!ALLOWED.has(key)) delete data[key];
      }

      // Validate roles
      data.roles = data.roles.filter(r =>
        r && typeof r.id === 'string' && r.id.length <= 64 &&
        typeof r.name === 'string' && r.name.length <= 64 &&
        /^#[0-9a-fA-F]{3,8}$/.test(r.color)
      ).map(r => ({
        id: r.id, name: r.name.slice(0, 64),
        commission: Math.max(0, Math.min(100, Number(r.commission) || 0)),
        color: r.color
      }));

      // Validate employees
      data.employees = data.employees.filter(emp =>
        emp && typeof emp.id === 'string' && emp.id.length <= 64 &&
        typeof emp.name === 'string' && emp.name.length <= 64
      ).map(emp => ({
        id: emp.id, name: emp.name.slice(0, 64),
        stateId: String(emp.stateId || '').slice(0, 64),
        roleId: String(emp.roleId || ''),
        active: !!emp.active,
        joinDate: Number(emp.joinDate) || Date.now(),
        ...(emp.inactiveDate ? { inactiveDate: Number(emp.inactiveDate) } : {})
      }));

      // Validate services
      data.services = data.services.filter(s =>
        s && typeof s.id === 'string' && s.id.length <= 64 &&
        typeof s.name === 'string' && s.name.length <= 64
      ).map(s => ({
        id: s.id, name: s.name.slice(0, 64),
        price: Math.max(0, Number(s.price) || 0),
        eventPrice: Math.max(0, Number(s.eventPrice) || 0),
        category: s.category === 'inventory' ? 'inventory' : 'service'
      }));

      Object.assign(state, data);
      saveState();
      if (onComplete) onComplete();
    } catch {
      alert('Failed to parse JSON file.');
    }
  };
  reader.readAsText(file);
}
