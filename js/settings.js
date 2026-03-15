import { $, esc } from './utils.js';
import { state, getService, saveState } from './state.js';
import { render } from './app.js';

export function renderSettings() {
  // Roles
  const rolesEl = $('rolesEditor');
  rolesEl.innerHTML = '';
  for (const role of state.roles) {
    const div = document.createElement('div');
    div.className = 'role-row';
    div.innerHTML = `
      <input class="role-color-input" type="color" value="${role.color}" data-role-color="${role.id}" />
      <input class="role-name-input" value="${esc(role.name)}" data-role-name="${role.id}" placeholder="Name" />
      <input class="role-pct-input" type="number" value="${role.commission}" data-role-pct="${role.id}" placeholder="%" min="0" max="100" />
      <span style="color:#a0a0a0;font-size:12px;">%</span>
      <button class="role-delete" data-role-delete="${role.id}" title="Remove">&times;</button>
    `;
    rolesEl.appendChild(div);
  }

  rolesEl.onchange = (e) => {
    const nameInput = e.target.closest('[data-role-name]');
    const pctInput = e.target.closest('[data-role-pct]');
    const colorInput = e.target.closest('[data-role-color]');

    if (nameInput) {
      const role = state.roles.find(r => r.id === nameInput.dataset.roleName);
      if (role) { role.name = nameInput.value; saveState(); }
    }
    if (pctInput) {
      const role = state.roles.find(r => r.id === pctInput.dataset.rolePct);
      if (role) { role.commission = Math.max(0, Math.min(100, parseFloat(pctInput.value) || 0)); saveState(); }
    }
    if (colorInput) {
      const role = state.roles.find(r => r.id === colorInput.dataset.roleColor);
      if (role) { role.color = colorInput.value; saveState(); }
    }
  };

  rolesEl.onclick = (e) => {
    const del = e.target.closest('[data-role-delete]');
    if (del) {
      state.roles = state.roles.filter(r => r.id !== del.dataset.roleDelete);
      render();
    }
  };

  // Services
  const svcEl = $('servicesEditor');
  svcEl.innerHTML = '';
  for (const svc of state.services) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input value="${esc(svc.name)}" data-svc-name="${svc.id}" style="width:100%;padding:6px 8px;font-size:13px;" /></td>
      <td><input type="number" value="${svc.price}" data-svc-price="${svc.id}" style="width:90px;padding:6px 8px;font-size:13px;" min="0" /></td>
      <td><input type="number" value="${svc.eventPrice ?? svc.price}" data-svc-event="${svc.id}" style="width:90px;padding:6px 8px;font-size:13px;" min="0" /></td>
      <td>
        <select data-svc-cat="${svc.id}" style="padding:6px;font-size:12px;">
          <option value="inventory" ${svc.category === 'inventory' ? 'selected' : ''}>Inventory</option>
          <option value="service" ${svc.category === 'service' ? 'selected' : ''}>Service</option>
        </select>
      </td>
      <td><button class="role-delete" data-svc-delete="${svc.id}" title="Remove">&times;</button></td>
    `;
    svcEl.appendChild(tr);
  }

  svcEl.onchange = (e) => {
    const nameIn = e.target.closest('[data-svc-name]');
    const priceIn = e.target.closest('[data-svc-price]');
    const eventIn = e.target.closest('[data-svc-event]');
    const catIn = e.target.closest('[data-svc-cat]');

    if (nameIn) { const s = getService(nameIn.dataset.svcName); if (s) s.name = nameIn.value; }
    if (priceIn) { const s = getService(priceIn.dataset.svcPrice); if (s) s.price = Math.max(0, parseFloat(priceIn.value) || 0); }
    if (eventIn) { const s = getService(eventIn.dataset.svcEvent); if (s) s.eventPrice = Math.max(0, parseFloat(eventIn.value) || 0); }
    if (catIn) { const s = getService(catIn.dataset.svcCat); if (s) s.category = catIn.value; }
    saveState();
  };

  svcEl.onclick = (e) => {
    const del = e.target.closest('[data-svc-delete]');
    if (del) {
      state.services = state.services.filter(s => s.id !== del.dataset.svcDelete);
      render();
    }
  };
}
