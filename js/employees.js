import { $, money, esc } from './utils.js';
import { state, getRole, calcEmployeeSales, calcEmployeeCommission,
         calcEmployeeServiceCount, saveState } from './state.js';
import { showConfirmModal, showEditEmployeeModal } from './modals.js';
import { render } from './app.js';

export function renderEmployees() {
  // Populate role dropdown
  const roleSelect = $('newEmpRole');
  if (roleSelect.children.length !== state.roles.length) {
    roleSelect.innerHTML = '';
    for (const role of state.roles) {
      const opt = document.createElement('option');
      opt.value = role.id;
      opt.textContent = role.name;
      roleSelect.appendChild(opt);
    }
  }

  const grid = $('employeeGrid');
  grid.innerHTML = '';

  let filtered = state.employees;
  if (state.employeeFilter === 'active') filtered = filtered.filter(e => e.active);
  else if (state.employeeFilter === 'inactive') filtered = filtered.filter(e => !e.active);

  // Sort: by role order then name
  const roleOrder = {};
  state.roles.forEach((r, i) => roleOrder[r.id] = i);
  filtered.sort((a, b) => (roleOrder[a.roleId] ?? 99) - (roleOrder[b.roleId] ?? 99) || a.name.localeCompare(b.name));

  for (const emp of filtered) {
    const role = getRole(emp.roleId);
    const sales = calcEmployeeSales(emp.id);
    const comm = calcEmployeeCommission(emp.id);
    const svcCount = calcEmployeeServiceCount(emp.id);

    const row = document.createElement('div');
    row.className = 'emp-row' + (emp.active ? '' : ' inactive');
    row.style.borderLeftColor = role ? role.color : '#666';
    row.innerHTML = `
      <div class="emp-row-left">
        <label class="toggle-switch" title="${emp.active ? 'Deactivate' : 'Activate'}">
          <input type="checkbox" ${emp.active ? 'checked' : ''} data-emp-toggle="${emp.id}" />
          <span class="toggle-slider"></span>
        </label>
        <span class="role-badge" style="background:${role ? role.color : '#666'}22;color:${role ? role.color : '#888'};border-color:${role ? role.color : '#666'};">${esc(role ? role.name : 'Unknown')}</span>
        <span class="emp-row-name">${esc(emp.name)} <span class="state-id-sep">|</span> <span class="state-id-inline">${esc(emp.stateId)}</span></span>
      </div>
      <div class="emp-row-stats">
        <span class="emp-row-stat"><span class="text-green">${money(sales)}</span></span>
        <span class="emp-row-stat"><span class="text-amber">${money(comm)}</span></span>
        <span class="emp-row-stat">${svcCount} svc</span>
      </div>
      <div class="emp-row-actions ec-actions">
        <button class="btn small" data-emp-edit="${emp.id}">Edit</button>
        <button class="btn small danger" data-emp-delete="${emp.id}">Remove</button>
      </div>
    `;
    grid.appendChild(row);
  }

  // Event delegation
  grid.onclick = (e) => {
    const editBtn = e.target.closest('[data-emp-edit]');
    const deleteBtn = e.target.closest('[data-emp-delete]');

    if (editBtn) {
      showEditEmployeeModal(editBtn.dataset.empEdit, () => render());
    } else if (deleteBtn) {
      showConfirmModal('Remove this employee? Their data will be lost.', () => {
        state.employees = state.employees.filter(em => em.id !== deleteBtn.dataset.empDelete);
        delete state.work[deleteBtn.dataset.empDelete];
        render();
      });
    }
  };

  grid.onchange = (e) => {
    const toggle = e.target.closest('[data-emp-toggle]');
    if (toggle) {
      const emp = state.employees.find(em => em.id === toggle.dataset.empToggle);
      if (emp) {
        emp.active = toggle.checked;
        render();
      }
    }
  };
}
