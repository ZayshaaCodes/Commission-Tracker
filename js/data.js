import { state, getRole, calcEmployeeSales, calcEmployeeCommission,
         calcEmployeeServiceCount, saveState } from './state.js';

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
      if (!data.employees || !data.services || !data.roles) {
        alert('Invalid data file format.');
        return;
      }
      Object.assign(state, data);
      saveState();
      if (onComplete) onComplete();
    } catch {
      alert('Failed to parse JSON file.');
    }
  };
  reader.readAsText(file);
}
