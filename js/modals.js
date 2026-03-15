import { $, esc } from './utils.js';
import { state, getRole } from './state.js';

export function showModal(html) {
  $('modalContent').innerHTML = html;
  $('modalOverlay').style.display = '';
}

export function hideModal() {
  $('modalOverlay').style.display = 'none';
}

export function showConfirmModal(message, onConfirm) {
  showModal(`
    <h3>Confirm</h3>
    <p style="color:#a0a0a0;">${esc(message)}</p>
    <div class="modal-actions">
      <button class="btn" id="modalCancel">Cancel</button>
      <button class="btn danger" id="modalConfirm">Confirm</button>
    </div>
  `);
  $('modalCancel').onclick = hideModal;
  $('modalConfirm').onclick = () => { hideModal(); onConfirm(); };
}

export function showEditEmployeeModal(empId, onSave) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  let roleOptions = state.roles.map(r =>
    `<option value="${r.id}" ${emp.roleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`
  ).join('');

  showModal(`
    <h3>Edit Employee</h3>
    <div class="control-group mb-8">
      <label>Name</label>
      <input id="editEmpName" value="${esc(emp.name)}" style="flex:1;" />
    </div>
    <div class="control-group mb-8">
      <label>State ID</label>
      <input id="editEmpStateId" value="${esc(emp.stateId)}" style="flex:1;" />
    </div>
    <div class="control-group mb-8">
      <label>Role</label>
      <select id="editEmpRole" style="flex:1;">${roleOptions}</select>
    </div>
    <div class="modal-actions">
      <button class="btn" id="editEmpCancel">Cancel</button>
      <button class="btn primary" id="editEmpSave">Save</button>
    </div>
  `);

  $('editEmpCancel').onclick = hideModal;
  $('editEmpSave').onclick = () => {
    const name = $('editEmpName').value.trim();
    const stateId = $('editEmpStateId').value.trim();
    const roleId = $('editEmpRole').value;
    if (!name) return;
    emp.name = name;
    emp.stateId = stateId;
    emp.roleId = roleId;
    hideModal();
    if (onSave) onSave();
  };
}
