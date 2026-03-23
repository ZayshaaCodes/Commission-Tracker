import { $, money, esc, toGMT8, timeAgo, safeColor, safeAttr } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWorkView,
         calcEmployeeSales, calcEmployeeCommission, calcEmployeeServiceCount, saveState } from './state.js';
import { isUnlocked, getAccessLevel } from './auth.js';
import { render } from './app.js';

let dashSort = { key: 'sales', dir: -1 };
let dashListenersBound = false;

export function renderDashboard() {
  const activeEmps = state.employees.filter(e => e.active);

  let totalSales = 0;
  let totalCommissions = 0;

  for (const emp of activeEmps) {
    totalSales += calcEmployeeSales(emp.id);
    totalCommissions += calcEmployeeCommission(emp.id);
  }

  const netRevenue = totalSales - totalCommissions;

  // Metrics
  $('metricsRow').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total Sales</div>
      <div class="metric-value green">${money(totalSales)}</div>
      <div class="metric-accent" style="background:#4ade80;"></div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Commissions</div>
      <div class="metric-value amber">${money(totalCommissions)}</div>
      <div class="metric-accent" style="background:#fbbf24;"></div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Net Revenue</div>
      <div class="metric-value blue">${money(netRevenue)}</div>
      <div class="metric-accent" style="background:#60a5fa;"></div>
    </div>
  `;

  // Employee table
  const tbody = $('dashboardBody');
  tbody.innerHTML = '';

  // Build data for sorting
  const roleIndex = {};
  state.roles.forEach((r, i) => { roleIndex[r.id] = i; });

  const empData = state.employees.map(emp => {
    const role = getRole(emp.roleId);
    return {
      emp,
      role,
      name: emp.name.toLowerCase(),
      roleRank: roleIndex[emp.roleId] ?? 999,
      sales: calcEmployeeSales(emp.id),
      commission: calcEmployeeCommission(emp.id),
      services: calcEmployeeServiceCount(emp.id),
      net: calcEmployeeSales(emp.id) - calcEmployeeCommission(emp.id)
    };
  });

  empData.sort((a, b) => {
    if (a.emp.active !== b.emp.active) return a.emp.active ? -1 : 1;
    const dir = dashSort.dir;
    switch (dashSort.key) {
      case 'name': return dir * a.name.localeCompare(b.name);
      case 'role': return dir * (a.roleRank - b.roleRank);
      case 'services': return dir * (a.services - b.services);
      case 'sales': return dir * (a.sales - b.sales);
      case 'commission': return dir * (a.commission - b.commission);
      case 'net': return dir * (a.net - b.net);
      default: return dir * (a.sales - b.sales);
    }
  });

  // Update sort arrows
  document.querySelectorAll('#dashboardTable th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === dashSort.key) {
      arrow.textContent = dashSort.dir === 1 ? ' ▲' : ' ▼';
      th.classList.add('sorted');
    } else {
      arrow.textContent = '';
      th.classList.remove('sorted');
    }
  });

  if (empData.length === 0) {
    const hint = getAccessLevel() === 'owner'
      ? 'No employees yet - add some in the Employees tab to get started'
      : 'No employees have been added yet';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px 20px;color:#888;">${hint}</td></tr>`;
  }

  for (const d of empData) {
    const emp = d.emp;
    const role = d.role;
    const sales = d.sales;
    const comm = d.commission;
    const net = d.net;
    const svcCount = d.services;

    // Build tooltip with service breakdown
    const work = getEmployeeWorkView(emp.id);
    const showTime = isUnlocked();
    let tipHtml = '';

    if (showTime) {
      // Show individual entries with time ago
      const allItems = [];
      for (const [svcId, qty] of Object.entries(work.inventory)) {
        if (qty <= 0) continue;
        const svc = getService(svcId);
        if (svc) allItems.push({ text: `${svc.name} x${qty} - ${money(getServicePrice(svcId) * qty)}`, time: null });
      }
      for (const entry of work.entries) {
        const svc = getService(entry.serviceId);
        if (!svc) continue;
        allItems.push({ text: `${svc.name} - ${money(getServicePrice(entry.serviceId))}`, time: entry.timestamp });
      }
      allItems.sort((a, b) => (b.time || 0) - (a.time || 0));
      tipHtml = allItems.map(i => `<div>${esc(i.text)}${i.time ? ` <span class="muted">${timeAgo(i.time)}</span>` : ''}</div>`).join('');
    } else {
      // Grouped summary for viewers
      const tipLines = [];
      for (const [svcId, qty] of Object.entries(work.inventory)) {
        if (qty <= 0) continue;
        const svc = getService(svcId);
        if (svc) tipLines.push(`${svc.name} x${qty} - ${money(getServicePrice(svcId) * qty)}`);
      }
      const svcCounts = {};
      for (const entry of work.entries) {
        const svc = getService(entry.serviceId);
        if (!svc) continue;
        svcCounts[entry.serviceId] = (svcCounts[entry.serviceId] || { name: svc.name, count: 0, total: 0 });
        svcCounts[entry.serviceId].count++;
        svcCounts[entry.serviceId].total += getServicePrice(entry.serviceId);
      }
      for (const s of Object.values(svcCounts)) {
        tipLines.push(`${s.name} x${s.count} - ${money(s.total)}`);
      }
      tipHtml = tipLines.map(l => `<div>${esc(l)}</div>`).join('');
    }

    const tr = document.createElement('tr');
    if (!emp.active) tr.style.opacity = '0.4';
    tr.dataset.tipHtml = tipHtml || '<div class="muted">No services logged</div>';
    const canActivate = !emp.active && isUnlocked();
    tr.innerHTML = `
      <td style="font-weight:600;">${emp.active ? `<span class="dash-emp-link" data-emp-id="${safeAttr(emp.id)}">` : '<span>'}${esc(emp.name)} <span class="state-id-sep">|</span> <span class="state-id-inline">${esc(emp.stateId)}</span></span></td>
      <td><span class="role-badge" style="background:${safeColor(role ? role.color : '#666')}22;color:${safeColor(role ? role.color : '#888')};border-color:${safeColor(role ? role.color : '#666')};">${esc(role ? role.name : 'Unknown')}</span></td>
      <td>${svcCount}</td>
      <td class="text-green">${money(sales)}</td>
      <td class="text-amber">${money(comm)}</td>
      <td class="text-blue">${money(net)}</td>
      <td>${canActivate
        ? `<button class="btn small success activate-btn" data-activate="${safeAttr(emp.id)}">Activate</button>`
        : `<span class="badge ${emp.active ? 'active' : 'inactive'}">${emp.active ? 'Active' : 'Inactive'}</span>`
      }</td>
    `;
    tbody.appendChild(tr);
  }

  // Activate button handler + name click
  tbody.onclick = (e) => {
    const btn = e.target.closest('[data-activate]');
    if (btn) {
      const emp = state.employees.find(em => em.id === btn.dataset.activate);
      if (emp) { emp.active = true; render(); }
      return;
    }
    const link = e.target.closest('[data-emp-id]');
    if (link) {
      state.selectedEmployeeId = link.dataset.empId;
      saveState();
      document.querySelector('[data-tab="commissions"]')?.click();
    }
  };

  // Hover tooltip + column sort (bind once, not every render)
  if (!dashListenersBound) {
    dashListenersBound = true;
    const tip = $('dashboardTooltip');
    tbody.addEventListener('mouseover', (e) => {
      const tr = e.target.closest('tr[data-tip-html]');
      if (!tr) { tip.style.display = 'none'; return; }
      tip.innerHTML = tr.dataset.tipHtml;
      tip.style.display = 'block';
    });
    tbody.addEventListener('mousemove', (e) => {
      if (tip.style.display === 'none') return;
      tip.style.left = (e.pageX + 12) + 'px';
      tip.style.top = (e.pageY + 16) + 'px';
    });
    tbody.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

    // Column header sort (event delegation on table)
    const table = document.getElementById('dashboardTable');
    table.addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (!th) return;
      const key = th.dataset.sort;
      if (dashSort.key === key) {
        dashSort.dir *= -1;
      } else {
        dashSort.key = key;
        dashSort.dir = key === 'name' || key === 'role' ? 1 : -1;
      }
      renderDashboard();
    });
  }
}

// --- ACTIVITY TIMELINE ---
export function renderTimeline() {
  const el = $('activityTimeline');
  if (!el) return;

  const allEntries = [];
  for (const emp of state.employees) {
    if (!emp.active) continue;
    const work = getEmployeeWorkView(emp.id);
    const role = getRole(emp.roleId);
    const color = role ? safeColor(role.color) : '#666';
    for (const entry of work.entries) {
      allEntries.push({ timestamp: entry.timestamp, serviceId: entry.serviceId, color });
    }
  }

  if (allEntries.length === 0) {
    el.innerHTML = '<div class="chart-empty">No activity recorded yet</div>';
    return;
  }

  // Use GMT-8 (PST) for consistent day boundaries across time zones
  const now = toGMT8(new Date());
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push({
      start: d.getTime(),
      end: d.getTime() + 86400000,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: 0,
      count: 0,
      isToday: i === 0
    });
  }

  for (const entry of allEntries) {
    const entryGMT8 = toGMT8(entry.timestamp).getTime();
    for (const day of days) {
      if (entryGMT8 >= day.start && entryGMT8 < day.end) {
        day.revenue += getServicePrice(entry.serviceId);
        day.count++;
      }
    }
  }

  const maxRevenue = Math.max(...days.map(d => d.revenue), 1);

  let html = '<div class="timeline-chart">';
  for (const day of days) {
    const pct = Math.max((day.revenue / maxRevenue) * 100, 2);
    const active = day.revenue > 0;
    html += `
      <div class="tl-col">
        <div class="tl-bar-wrap">
          <div class="tl-bar${active ? ' active' : ''}${day.isToday ? ' today' : ''}" style="height:${pct.toFixed(1)}%;">
            <div class="tl-tooltip">${day.dateStr}<br>${money(day.revenue)} &middot; ${day.count} svc</div>
          </div>
        </div>
        <span class="tl-label${day.isToday ? ' today' : ''}">${day.label}</span>
      </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// --- SALES BY EMPLOYEE CHART ---
export function renderSalesChart(activeEmps) {
  const el = $('salesChart');
  if (!el) return;

  const empSales = activeEmps
    .map(emp => ({
      name: emp.name,
      sales: calcEmployeeSales(emp.id),
      color: safeColor((getRole(emp.roleId) || {}).color || '#666')
    }))
    .sort((a, b) => b.sales - a.sales);

  if (empSales.length === 0 || empSales.every(e => e.sales === 0)) {
    el.innerHTML = '<div class="chart-empty">No sales data yet</div>';
    return;
  }

  const maxSales = Math.max(...empSales.map(e => e.sales), 1);

  let html = '';
  for (const e of empSales) {
    const pct = (e.sales / maxSales * 100).toFixed(1);
    html += `
      <div class="sb-row">
        <span class="sb-name">${esc(e.name)}</span>
        <div class="sb-track">
          <div class="sb-fill" style="width:${pct}%;background:${e.color};"></div>
        </div>
        <span class="sb-amount">${money(e.sales)}</span>
      </div>`;
  }
  el.innerHTML = html;
}
