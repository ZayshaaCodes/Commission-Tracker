import { $, money, uid, esc, timeAgo, safeColor, safeAttr } from './utils.js';
import { state, getRole, getService, getServiceGroup, getServicePrice, getEmployeeWork,
         getEmployeeWorkView, calcEmployeeSales, calcEmployeeCommission, calcEmployeeFlatPayout,
         isFlatPayout, getFlatPayout, saveState, logActivity } from './state.js';
import { getAccessLevel } from './auth.js';
import { flushSync } from './firebase.js';

// Module-level handler so removeEventListener can find the same reference
function closeDropdown(e) {
  if (!e.target.closest('.emp-dropdown-wrap')) {
    const dl = $('employeeDropdownList');
    const ndl = $('noEmpDropdownList');
    if (dl) dl.style.display = 'none';
    if (ndl) ndl.style.display = 'none';
  }
}
let dropdownListenerBound = false;

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

  // Close on outside click (bound once at module level)
  if (!dropdownListenerBound) {
    document.addEventListener('click', closeDropdown);
    dropdownListenerBound = true;
  }

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
  const work = getEmployeeWorkView(emp.id);

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
    const prevQty = w.inventory[svcId] || 0;
    w.inventory[svcId] = Math.max(0, prevQty + dir);
    if (w.inventory[svcId] === 0) delete w.inventory[svcId];
    const changed = (w.inventory[svcId] || 0) !== prevQty;

    // Work log: batch inventory sales within 1-minute window
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
      const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
      const role = emp ? getRole(emp.roleId) : null;
      const svc = getService(svcId);
      logActivity({
        type: 'inventory',
        empId: state.selectedEmployeeId,
        empName: emp ? emp.name : 'Unknown',
        color: safeColor(role ? role.color : '#666'),
        serviceName: svc ? svc.name : 'Unknown',
        serviceId: svcId,
        quantity: 1,
        unitPrice: getServicePrice(svcId)
      });
    } else if (dir === -1 && changed) {
      const recent = w.inventoryLog.find(
        log => log.serviceId === svcId && (now - log.timestamp) < BATCH_WINDOW && log.quantity > 0
      );
      if (recent) {
        recent.quantity -= 1;
        if (recent.quantity <= 0) {
          w.inventoryLog = w.inventoryLog.filter(log => log.id !== recent.id);
        }
      }
      const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
      const role = emp ? getRole(emp.roleId) : null;
      const svc = getService(svcId);
      logActivity({
        type: 'inv-remove',
        empId: state.selectedEmployeeId,
        empName: emp ? emp.name : 'Unknown',
        color: safeColor(role ? role.color : '#666'),
        serviceName: svc ? svc.name : 'Unknown',
        serviceId: svcId,
        quantity: 1,
        unitPrice: getServicePrice(svcId)
      });
    }

    renderCommissions();
    saveState();
    flushSync();
  };

  // Service buttons - grouped by user-defined service groups
  const logServices = state.services.filter(s => s.category === 'service');
  const svcBtnsEl = $('serviceButtons');
  svcBtnsEl.innerHTML = '';

  // Sort groups by sortOrder then render each
  const sortedGroups = [...state.serviceGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const group of sortedGroups) {
    const groupSvcs = logServices.filter(s => s.group === group.id);
    if (groupSvcs.length === 0) continue;

    const color = safeColor(group.color || '#888');

    const row = document.createElement('div');
    row.className = 'svc-row';

    const label = document.createElement('div');
    label.className = 'svc-row-label';
    label.style.borderLeftColor = color;
    label.style.color = color;
    label.textContent = group.name;
    row.appendChild(label);

    const wrap = document.createElement('div');
    wrap.className = 'svc-row-btns';

    for (const svc of groupSvcs) {
      const price = getServicePrice(svc.id);
      const btn = document.createElement('button');
      btn.className = 'service-btn';
      btn.style.borderColor = color + '55';
      btn.style.backgroundColor = color + '12';
      btn.innerHTML = `<span class="svc-name">${esc(svc.name)}</span><span class="svc-price">${money(price)}</span>`;
      btn.onclick = () => {
        const w = getEmployeeWork(state.selectedEmployeeId);
        w.entries.push({ id: uid(), serviceId: svc.id, timestamp: Date.now() });
        const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
        const role = emp ? getRole(emp.roleId) : null;
        logActivity({
          type: 'service',
          empName: emp ? emp.name : 'Unknown',
          color: safeColor(role ? role.color : '#666'),
          serviceName: svc.name,
          price: getServicePrice(svc.id)
        });
        renderCommissions();
        saveState();
        flushSync();
      };
      wrap.appendChild(btn);
    }

    row.appendChild(wrap);
    svcBtnsEl.appendChild(row);
  }

  // Ungrouped services (no group set, or group was deleted)
  const groupedIds = new Set(state.serviceGroups.map(g => g.id));
  const ungrouped = logServices.filter(s => !s.group || !groupedIds.has(s.group));
  if (ungrouped.length > 0) {
    const row = document.createElement('div');
    row.className = 'svc-row';

    const label = document.createElement('div');
    label.className = 'svc-row-label';
    label.style.borderLeftColor = '#888';
    label.style.color = '#888';
    label.textContent = 'Ungrouped';
    row.appendChild(label);

    const wrap = document.createElement('div');
    wrap.className = 'svc-row-btns';

    for (const svc of ungrouped) {
      const price = getServicePrice(svc.id);
      const btn = document.createElement('button');
      btn.className = 'service-btn';
      btn.style.borderColor = '#88888855';
      btn.style.backgroundColor = '#88888812';
      btn.innerHTML = `<span class="svc-name">${esc(svc.name)}</span><span class="svc-price">${money(price)}</span>`;
      btn.onclick = () => {
        const w = getEmployeeWork(state.selectedEmployeeId);
        w.entries.push({ id: uid(), serviceId: svc.id, timestamp: Date.now() });
        const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
        const role = emp ? getRole(emp.roleId) : null;
        logActivity({
          type: 'service',
          empName: emp ? emp.name : 'Unknown',
          color: safeColor(role ? role.color : '#666'),
          serviceName: svc.name,
          price: getServicePrice(svc.id)
        });
        renderCommissions();
        saveState();
        flushSync();
      };
      wrap.appendChild(btn);
    }

    row.appendChild(wrap);
    svcBtnsEl.appendChild(row);
  }

  // Flat payouts (material runs, gold, etc.) - hidden when none are configured
  const flatSvcs = state.services.filter(isFlatPayout);
  const payoutsSection = document.querySelector('.payouts-section');
  const payoutBtnsEl = $('flatPayoutButtons');
  payoutsSection.style.display = flatSvcs.length ? '' : 'none';
  payoutBtnsEl.innerHTML = '';

  for (const svc of flatSvcs) {
    const payout = getFlatPayout(svc.id);
    const btn = document.createElement('button');
    btn.className = 'service-btn payout-btn';
    btn.innerHTML = `<span class="svc-name">${esc(svc.name)}</span><span class="svc-price">${money(payout)}</span>`;
    btn.onclick = () => {
      const w = getEmployeeWork(state.selectedEmployeeId);
      w.entries.push({ id: uid(), serviceId: svc.id, timestamp: Date.now() });
      const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
      const role = emp ? getRole(emp.roleId) : null;
      logActivity({
        type: 'flat-payout',
        empName: emp ? emp.name : 'Unknown',
        color: safeColor(role ? role.color : '#666'),
        serviceName: svc.name,
        price: payout
      });
      renderCommissions();
      saveState();
      flushSync();
    };
    payoutBtnsEl.appendChild(btn);
  }

  // Customization section visibility
  const customizeSection = document.querySelector('.customize-section');
  if (customizeSection) customizeSection.style.display = state.customizeEnabled ? '' : 'none';

  // Customization button
  const customizeBtn = $('customizeBtn');
  const customizeInput = $('customizeAmount');
  customizeBtn.onclick = () => {
    const amount = parseFloat(customizeInput.value);
    if (!amount || amount <= 0) return;
    const w = getEmployeeWork(state.selectedEmployeeId);
    w.entries.push({ id: uid(), type: 'customize', amount, timestamp: Date.now() });
    const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
    const role = emp ? getRole(emp.roleId) : null;
    logActivity({
      type: 'service',
      empName: emp ? emp.name : 'Unknown',
      color: safeColor(role ? role.color : '#666'),
      serviceName: 'Customize',
      price: amount
    });
    customizeInput.value = '';
    renderCommissions();
    saveState();
    flushSync();
  };

  // Summary
  const sales = calcEmployeeSales(emp.id);
  const commAmt = calcEmployeeCommission(emp.id);
  const net = sales - commAmt;
  const commRate = role ? role.commission : 0;
  const payoutAmt = calcEmployeeFlatPayout(emp.id);

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
    ${payoutAmt > 0 ? `
    <div class="compact-stat">
      <span class="cs-label">Payouts</span>
      <span class="cs-value text-amber">${money(payoutAmt)}</span>
    </div>` : ''}
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
    if (entry.type === 'customize') {
      logItems.push({
        type: 'entry',
        name: 'Customize',
        total: entry.amount,
        entryId: entry.id,
        timestamp: entry.timestamp
      });
    } else {
      const svc = getService(entry.serviceId);
      if (svc) {
        const flat = isFlatPayout(svc);
        logItems.push({
          type: 'entry',
          name: svc.name,
          total: flat ? getFlatPayout(entry.serviceId) : getServicePrice(entry.serviceId),
          payout: flat,
          entryId: entry.id,
          timestamp: entry.timestamp
        });
      }
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
        <span class="log-price${item.payout ? ' payout' : ''}">${money(item.total)}</span>
        <span class="log-time">${timeAgo(item.timestamp)}</span>
        ${deleteBtn}
      `;
      logEl.appendChild(div);
    }

    logEl.onclick = (e) => {
      const del = e.target.closest('.log-delete');
      if (!del) return;
      const w = getEmployeeWork(state.selectedEmployeeId);
      const emp = state.employees.find(em => em.id === state.selectedEmployeeId);
      const role = emp ? getRole(emp.roleId) : null;
      const entryId = del.dataset.entryId;
      const logId = del.dataset.logId;
      if (entryId) {
        const entry = w.entries.find(en => en.id === entryId);
        if (entry) {
          if (entry.type === 'customize') {
            logActivity({
              type: 'remove',
              empName: emp ? emp.name : 'Unknown',
              color: safeColor(role ? role.color : '#666'),
              serviceName: 'Customize',
              price: entry.amount
            });
          } else {
            const svc = getService(entry.serviceId);
            logActivity({
              type: 'remove',
              empName: emp ? emp.name : 'Unknown',
              color: safeColor(role ? role.color : '#666'),
              serviceName: svc ? svc.name : 'Unknown',
              price: isFlatPayout(svc) ? getFlatPayout(entry.serviceId) : getServicePrice(entry.serviceId)
            });
          }
        }
        w.entries = w.entries.filter(en => en.id !== entryId);
      } else if (logId) {
        const log = w.inventoryLog.find(l => l.id === logId);
        if (log) {
          const svc = getService(log.serviceId);
          logActivity({
            type: 'remove',
            empName: emp ? emp.name : 'Unknown',
            color: safeColor(role ? role.color : '#666'),
            serviceName: svc ? `${svc.name} x${log.quantity}` : 'Unknown',
            price: getServicePrice(log.serviceId) * log.quantity
          });
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
