import { $, money, uid, esc } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWork,
         calcEmployeeSales, calcEmployeeCommission, saveState } from './state.js';

export function renderCommissions() {
  const activeEmps = state.employees.filter(e => e.active);
  const picker = $('employeePicker');
  picker.innerHTML = '';

  for (const emp of activeEmps) {
    const role = getRole(emp.roleId);
    const sales = calcEmployeeSales(emp.id);
    const pill = document.createElement('button');
    pill.className = 'emp-pill' + (state.selectedEmployeeId === emp.id ? ' selected' : '');
    pill.innerHTML = `
      <span class="emp-pill-dot" style="background:${role ? role.color : '#666'};"></span>
      ${esc(emp.name)} <span class="state-id-sep">|</span> <span class="state-id-inline">${esc(emp.stateId)}</span>
      <span class="emp-pill-sales">${money(sales)}</span>
    `;
    pill.onclick = () => {
      state.selectedEmployeeId = emp.id;
      renderCommissions();
    };
    picker.appendChild(pill);
  }

  if (!state.selectedEmployeeId || !activeEmps.find(e => e.id === state.selectedEmployeeId)) {
    $('commissionWorkArea').style.display = 'none';
    $('noEmployeeSelected').style.display = '';
    return;
  }

  $('commissionWorkArea').style.display = '';
  $('noEmployeeSelected').style.display = 'none';

  const emp = state.employees.find(e => e.id === state.selectedEmployeeId);
  const role = getRole(emp.roleId);
  const work = getEmployeeWork(emp.id);

  $('workEmployeeName').textContent = emp.name + (role ? ` (${role.name})` : '');

  // Inventory counters
  const inventoryServices = state.services.filter(s => s.category === 'inventory');
  const countersEl = $('inventoryCounters');
  countersEl.innerHTML = '';

  for (const svc of inventoryServices) {
    const qty = work.inventory[svc.id] || 0;
    const price = getServicePrice(svc.id);
    const div = document.createElement('div');
    div.className = 'counter-item';
    div.innerHTML = `
      <span class="counter-name">${esc(svc.name)}</span>
      <span class="counter-price">${money(price)}</span>
      <div class="counter-controls">
        <button class="counter-btn minus" data-svc="${svc.id}" data-dir="-1">&minus;</button>
        <span class="counter-value${qty > 0 ? ' has-value' : ''}">${qty}</span>
        <button class="counter-btn plus" data-svc="${svc.id}" data-dir="1">+</button>
      </div>
    `;
    countersEl.appendChild(div);
  }

  countersEl.onclick = (e) => {
    const btn = e.target.closest('.counter-btn');
    if (!btn) return;
    const svcId = btn.dataset.svc;
    const dir = parseInt(btn.dataset.dir);
    const w = getEmployeeWork(state.selectedEmployeeId);
    w.inventory[svcId] = Math.max(0, (w.inventory[svcId] || 0) + dir);
    if (w.inventory[svcId] === 0) delete w.inventory[svcId];
    renderCommissions();
    saveState();
  };

  // Service buttons — grouped by price tier
  const logServices = state.services.filter(s => s.category === 'service');
  const svcBtnsEl = $('serviceButtons');
  svcBtnsEl.innerHTML = '';

  const groups = [
    { label: 'Government', color: '#6b7280', test: p => p === 0 },
    { label: 'Services',   color: '#3b82f6', test: p => p > 0 && p <= 1000 },
    { label: 'Upgrades',   color: '#a855f7', test: p => p > 1000 && p <= 5000 },
    { label: 'Packages',   color: '#f59e0b', test: p => p > 5000 }
  ];

  for (const group of groups) {
    const groupSvcs = logServices.filter(s => group.test(s.price));
    if (groupSvcs.length === 0) continue;

    const row = document.createElement('div');
    row.className = 'svc-row';

    const label = document.createElement('div');
    label.className = 'svc-row-label';
    label.style.borderLeftColor = group.color;
    label.style.color = group.color;
    label.textContent = group.label;
    row.appendChild(label);

    const wrap = document.createElement('div');
    wrap.className = 'svc-row-btns';

    for (const svc of groupSvcs) {
      const price = getServicePrice(svc.id);
      const btn = document.createElement('button');
      btn.className = 'service-btn';
      btn.style.borderColor = group.color + '55';
      btn.style.backgroundColor = group.color + '12';
      btn.innerHTML = `<span class="svc-name">${esc(svc.name)}</span><span class="svc-price">${money(price)}</span>`;
      btn.onclick = () => {
        const w = getEmployeeWork(state.selectedEmployeeId);
        w.entries.push({ id: uid(), serviceId: svc.id, timestamp: Date.now() });
        renderCommissions();
        saveState();
      };
      wrap.appendChild(btn);
    }

    row.appendChild(wrap);
    svcBtnsEl.appendChild(row);
  }

  // Summary
  const sales = calcEmployeeSales(emp.id);
  const commAmt = calcEmployeeCommission(emp.id);
  const net = sales - commAmt;
  const commRate = role ? role.commission : 0;

  $('compactSummary').innerHTML = `
    <div class="compact-stat">
      <span class="cs-label">Gross</span>
      <span class="cs-value text-green">${money(sales)}</span>
    </div>
    <div class="compact-stat">
      <span class="cs-label">Rate</span>
      <span class="cs-value text-amber">${commRate}%</span>
    </div>
    <div class="compact-stat">
      <span class="cs-label">Commission</span>
      <span class="cs-value text-amber">${money(commAmt)}</span>
    </div>
    <div class="compact-stat">
      <span class="cs-label">Net</span>
      <span class="cs-value text-blue">${money(net)}</span>
    </div>
  `;

  // Service log
  const logEl = $('serviceLog');
  logEl.innerHTML = '';

  const logItems = [];

  for (const [svcId, qty] of Object.entries(work.inventory)) {
    if (qty > 0) {
      const svc = getService(svcId);
      if (svc) {
        logItems.push({
          type: 'inventory',
          name: `${svc.name} x${qty}`,
          total: getServicePrice(svcId) * qty,
          svcId
        });
      }
    }
  }

  const sortedEntries = [...work.entries].sort((a, b) => b.timestamp - a.timestamp);
  for (const entry of sortedEntries) {
    const svc = getService(entry.serviceId);
    if (svc) {
      logItems.push({
        type: 'entry',
        name: svc.name,
        total: getServicePrice(entry.serviceId),
        entryId: entry.id
      });
    }
  }

  if (logItems.length === 0) {
    logEl.innerHTML = '<div class="log-empty">No services logged yet</div>';
  } else {
    for (const item of logItems) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.innerHTML = `
        <span class="log-name">${esc(item.name)}</span>
        <span class="log-price">${money(item.total)}</span>
        ${item.type === 'entry' ? `<button class="log-delete" data-entry-id="${item.entryId}" title="Remove">&times;</button>` : ''}
      `;
      logEl.appendChild(div);
    }

    logEl.onclick = (e) => {
      const del = e.target.closest('.log-delete');
      if (!del) return;
      const entryId = del.dataset.entryId;
      const w = getEmployeeWork(state.selectedEmployeeId);
      w.entries = w.entries.filter(en => en.id !== entryId);
      renderCommissions();
      saveState();
    };
  }
}
