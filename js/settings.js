import { $, esc, safeAttr, safeColor } from './utils.js';
import { state, getService, saveState } from './state.js';
import { render, applyBranding } from './app.js';

const MAX_LOGO_BYTES = 256 * 1024;
let brandingBound = false;

function bindBranding() {
  if (brandingBound) return;
  brandingBound = true;

  const fileInput = $('logoFileInput');
  const uploadBtn = $('uploadLogoBtn');
  const removeBtn = $('removeLogoBtn');
  const nameInput = $('shopDisplayName');

  uploadBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      alert('Logo must be under 256 KB.');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.shopLogo = reader.result;
      saveState();
      applyBranding();
      renderBrandingUI();
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  };

  removeBtn.onclick = () => {
    state.shopLogo = '';
    saveState();
    applyBranding();
    renderBrandingUI();
  };

  nameInput.onchange = () => {
    state.shopName = nameInput.value.trim().slice(0, 48);
    saveState();
    applyBranding();
  };
}

function renderBrandingUI() {
  const preview = $('logoPreview');
  const removeBtn = $('removeLogoBtn');
  const nameInput = $('shopDisplayName');

  preview.src = state.shopLogo || 'Logo_a_ds.png';
  removeBtn.style.display = state.shopLogo ? '' : 'none';
  nameInput.value = state.shopName || '';
}

export function renderSettings() {
  // Roles
  const rolesEl = $('rolesEditor');
  rolesEl.innerHTML = '';
  for (const role of state.roles) {
    const div = document.createElement('div');
    div.className = 'role-row';
    div.innerHTML = `
      <input class="role-color-input" type="color" value="${role.color}" data-role-color="${safeAttr(role.id)}" />
      <input class="role-name-input" value="${esc(role.name)}" data-role-name="${safeAttr(role.id)}" placeholder="Name" />
      <input class="role-pct-input" type="number" value="${role.commission}" data-role-pct="${safeAttr(role.id)}" placeholder="%" min="0" max="100" />
      <span style="color:#a0a0a0;font-size:12px;">%</span>
      <button class="role-delete" data-role-delete="${safeAttr(role.id)}" title="Remove">&times;</button>
    `;
    rolesEl.appendChild(div);
  }

  rolesEl.onchange = (e) => {
    const nameInput = e.target.closest('[data-role-name]');
    const pctInput = e.target.closest('[data-role-pct]');
    const colorInput = e.target.closest('[data-role-color]');

    if (nameInput) {
      const role = state.roles.find(r => r.id === nameInput.dataset.roleName);
      if (role) { role.name = nameInput.value.slice(0, 64); saveState(); }
    }
    if (pctInput) {
      const role = state.roles.find(r => r.id === pctInput.dataset.rolePct);
      if (role) { role.commission = Math.max(0, Math.min(100, parseFloat(pctInput.value) || 0)); saveState(); }
    }
    if (colorInput) {
      const role = state.roles.find(r => r.id === colorInput.dataset.roleColor);
      if (role) { role.color = safeColor(colorInput.value); saveState(); }
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
      <td><input value="${esc(svc.name)}" data-svc-name="${safeAttr(svc.id)}" style="width:100%;padding:6px 8px;font-size:13px;" /></td>
      <td><input type="number" value="${svc.price}" data-svc-price="${safeAttr(svc.id)}" style="width:90px;padding:6px 8px;font-size:13px;" min="0" /></td>
      <td><input type="number" value="${svc.eventPrice ?? svc.price}" data-svc-event="${safeAttr(svc.id)}" style="width:90px;padding:6px 8px;font-size:13px;" min="0" /></td>
      <td>
        <select data-svc-cat="${safeAttr(svc.id)}" style="padding:6px;font-size:12px;">
          <option value="inventory" ${svc.category === 'inventory' ? 'selected' : ''}>Inventory</option>
          <option value="service" ${svc.category === 'service' ? 'selected' : ''}>Service</option>
        </select>
      </td>
      <td><button class="role-delete" data-svc-delete="${safeAttr(svc.id)}" title="Remove">&times;</button></td>
    `;
    svcEl.appendChild(tr);
  }

  svcEl.onchange = (e) => {
    const nameIn = e.target.closest('[data-svc-name]');
    const priceIn = e.target.closest('[data-svc-price]');
    const eventIn = e.target.closest('[data-svc-event]');
    const catIn = e.target.closest('[data-svc-cat]');

    if (nameIn) { const s = getService(nameIn.dataset.svcName); if (s) s.name = nameIn.value.slice(0, 64); }
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

  // Branding
  bindBranding();
  renderBrandingUI();
}
