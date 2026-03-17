import { $, money, uid, esc, timeAgo, safeColor, safeAttr } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWork,
         calcEmployeeSales, calcEmployeeCommission, saveState } from './state.js';
import { getAccessLevel } from './auth.js';
import { flushSync } from './firebase.js';

export function renderCommissions() {
  const activeEmps = state.employees.filter(e => e.active);
  const dropList = $('employeeDropdownList');
  const noEmpDropList = $('noEmpDropdownList');

  // Build dropdown items for both locations
  function populateDropdown(listEl) {
    listEl.innerHTML = '';
    for (const emp of activeEmps) {
      const role = getRole(emp.roleId);
      const item = document.createElement('button');
      item.className = 'emp-dropdown-item' + (state.selectedEmployeeId === emp.id ? ' selected' : '');
      item.innerHTML = `
        <span class="emp-pill-dot" style="background:${safeColor(role ? role.color : '#666')};"></span>
        ${esc(emp.name)} <span class="state-id-sep">|</span> <span class="state-id-inline">${esc(emp.stateId)}</span>
      `;
      item.onclick = (e) => {
        e.stopPropagation();
        state.selectedEmployeeId = emp.id;
        listEl.style.display = 'none';
        saveState();
        renderCommissions();
      };
      listEl.appendChild(item);
    }
  }

  populateDropdown(dropList);
  populateDropdown(noEmpDropList);

  // Header click toggles dropdown
  const header = $('workEmployeeHeader');
  header.onclick = (e) => {
    if (e.target.closest('.panel-actions')) return;
    e.stopPropagation();
    dropList.style.display = dropList.style.display === 'none' ? '' : 'none';
  };

  // No-employee state dropdown
  const noEmpBtn = $('noEmpDropdownBtn');
  noEmpBtn.onclick = (e) => {
    e.stopPropagation();
    noEmpDropList.style.display = noEmpDropList.style.display === 'none' ? '' : 'none';
  };

  // Close on outside click
  const closeDropdown = (e) => {
    if (!e.target.closest('.emp-dropdown-wrap')) {
      dropList.style.display = 'none';
      noEmpDropList.style.display = 'none';
    }
  };
  document.removeEventListener('click', closeDropdown);
  document.addEventListener('click', closeDropdown);

  // Locked viewers always see the lock screen
  if (getAccessLevel() === 'viewer') {
    $('commissionWorkArea').style.display = 'none';
    $('noEmployeeSelected').style.display = '';
    const emptyIcon = $('noEmployeeSelected').querySelector('.empty-icon');
    const emptyMsg = $('noEmployeeSelected').querySelector('.empty-msg');
    const emptyDropWrap = $('noEmployeeSelected').querySelector('.emp-dropdown-wrap');
    emptyIcon.textContent = '🔒';
    emptyMsg.textContent = 'Unlock to start logging services';
    emptyDropWrap.style.display = 'none';
    return;
  }

  if (!state.selectedEmployeeId || !activeEmps.find(e => e.id === state.selectedEmployeeId)) {
    $('commissionWorkArea').style.display = 'none';
    $('noEmployeeSelected').style.display = '';

    // Adapt empty state message based on context
    const emptyIcon = $('noEmployeeSelected').querySelector('.empty-icon');
    const emptyMsg = $('noEmployeeSelected').querySelector('.empty-msg');
    const emptyDropWrap = $('noEmployeeSelected').querySelector('.emp-dropdown-wrap');
    if (activeEmps.length === 0) {
      emptyIcon.textContent = '👥';
      emptyMsg.textContent = getAccessLevel() === 'owner'
        ? 'No employees added yet - head to the Employees tab to get started'
        : 'No employees have been added yet';
      emptyDropWrap.style.display = 'none';
    } else {
      emptyIcon.textContent = '👆';
      emptyMsg.textContent = 'Select an employee to start logging services';
      emptyDropWrap.style.display = '';
    }
    return;
  }

  $('commissionWorkArea').style.display = '';
  $('noEmployeeSelected').style.display = 'none';

  // Only owners can clear
  $('clearEmployeeWork').style.display = getAccessLevel() === 'owner' ? '' : 'none';

  const emp = state.employees.find(e => e.id === state.selectedEmployeeId);
  const role = getRole(emp.roleId);
  const work = getEmployeeWork(emp.id);

  $('workEmployeeHeader').innerHTML = `
    <span class="work-emp-name">${esc(emp.name)}</span>
    <span class="state-id-sep">|</span>
    <span class="work-emp-id">${esc(emp.stateId)}</span>
    ${role ? `<span class="role-badge" style="background:${safeColor(role.color)}22;color:${safeColor(role.color)};border-color:${safeColor(role.color)};">${esc(role.name)}</span>` : ''}
    <span class="emp-dropdown-arrow">&#9662;</span>
  `;

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
        <button class="counter-btn minus" data-svc="${safeAttr(svc.id)}" data-dir="-1">&minus;</button>
        <span class="counter-value${qty > 0 ? ' has-value' : ''}">${qty}</span>
        <button class="counter-btn plus" data-svc="${safeAttr(svc.id)}" data-dir="1">+</button>
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

    // Activity feed: batch inventory sales within 1-minute window
    const now = Date.now();
    const BATCH_WINDOW = 60000;
    if (dir === 1) {
      const recent = w.inventoryLog.find(
        log => log.serviceId === svcId && (now - log.timestamp) < BATCH_WINDOW
      );
      if (recent) {
        recent.quantity += 1;
      } else {
        w.inventoryLog.push({ id: uid(), serviceId: svcId, quantity: 1, timestamp: now });
      }
    } else if (dir === -1) {
      const recent = w.inventoryLog.find(
        log => log.serviceId === svcId && (now - log.timestamp) < BATCH_WINDOW && log.quantity > 0
      );
      if (recent) {
        recent.quantity -= 1;
        if (recent.quantity <= 0) {
          w.inventoryLog = w.inventoryLog.filter(log => log.id !== recent.id);
        }
      }
    }

    renderCommissions();
    saveState();
    flushSync();
  };

  // Service buttons - grouped by price tier
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
        flushSync();
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

  for (const log of work.inventoryLog) {
    if (log.quantity > 0) {
      const svc = getService(log.serviceId);
      if (svc) {
        logItems.push({
          type: 'inventory',
          name: `${svc.name} x${log.quantity}`,
          total: getServicePrice(log.serviceId) * log.quantity,
          logId: log.id,
          timestamp: log.timestamp
        });
      }
    }
  }

  for (const entry of work.entries) {
    const svc = getService(entry.serviceId);
    if (svc) {
      logItems.push({
        type: 'entry',
        name: svc.name,
        total: getServicePrice(entry.serviceId),
        entryId: entry.id,
        timestamp: entry.timestamp
      });
    }
  }

  logItems.sort((a, b) => b.timestamp - a.timestamp);

  if (logItems.length === 0) {
    logEl.innerHTML = '<div class="log-empty">No services logged yet</div>';
  } else {
    for (const item of logItems) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      const deleteBtn = item.type === 'entry'
        ? `<button class="log-delete" data-entry-id="${item.entryId}" title="Remove">&times;</button>`
        : `<button class="log-delete" data-log-id="${item.logId}" title="Remove">&times;</button>`;
      div.innerHTML = `
        <span class="log-name">${esc(item.name)}</span>
        <span class="log-price">${money(item.total)}</span>
        <span class="log-time">${timeAgo(item.timestamp)}</span>
        ${deleteBtn}
      `;
      logEl.appendChild(div);
    }

    logEl.onclick = (e) => {
      const del = e.target.closest('.log-delete');
      if (!del) return;
      const w = getEmployeeWork(state.selectedEmployeeId);
      const entryId = del.dataset.entryId;
      const logId = del.dataset.logId;
      if (entryId) {
        w.entries = w.entries.filter(en => en.id !== entryId);
      } else if (logId) {
        const log = w.inventoryLog.find(l => l.id === logId);
        if (log) {
          w.inventory[log.serviceId] = Math.max(0, (w.inventory[log.serviceId] || 0) - log.quantity);
          if (w.inventory[log.serviceId] === 0) delete w.inventory[log.serviceId];
          w.inventoryLog = w.inventoryLog.filter(l => l.id !== logId);
        }
      }
      renderCommissions();
      saveState();
      flushSync();
    };
  }
}
