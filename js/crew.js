import { $, money, esc, timeAgo } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWork,
         calcEmployeeSales, calcEmployeeCommission, calcEmployeeServiceCount } from './state.js';

let crewFilter = 'active';

export function setCrewFilter(f) { crewFilter = f; }
export function getCrewFilter() { return crewFilter; }

export function renderCrew() {
  // --- Crew Stats ---
  const total = state.employees.length;
  const active = state.employees.filter(e => e.active).length;
  const inactive = total - active;
  let totalSales = 0;
  let totalCommission = 0;
  for (const emp of state.employees) {
    totalSales += calcEmployeeSales(emp.id);
    totalCommission += calcEmployeeCommission(emp.id);
  }

  const statsEl = $('crewStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="crew-stat"><span class="crew-stat-val">${active}</span><span class="crew-stat-lbl">Active</span></div>
      <div class="crew-stat"><span class="crew-stat-val">${inactive}</span><span class="crew-stat-lbl">Inactive</span></div>
      <div class="crew-stat"><span class="crew-stat-val text-green">${money(totalSales)}</span><span class="crew-stat-lbl">Gross Sales</span></div>
      <div class="crew-stat"><span class="crew-stat-val text-amber">${money(totalCommission)}</span><span class="crew-stat-lbl">Commission</span></div>
      <div class="crew-stat"><span class="crew-stat-val text-blue">${money(totalSales - totalCommission)}</span><span class="crew-stat-lbl">Net</span></div>
    `;
  }

  // --- Activity Feed ---
  const feedEl = $('activityFeed');
  if (feedEl) {
    const allEntries = [];
    for (const emp of state.employees) {
      const work = getEmployeeWork(emp.id);
      const role = getRole(emp.roleId);
      for (const entry of work.entries) {
        const svc = getService(entry.serviceId);
        allEntries.push({
          empName: emp.name,
          color: role ? role.color : '#666',
          action: svc ? svc.name : 'Unknown',
          price: getServicePrice(entry.serviceId),
          timestamp: entry.timestamp
        });
      }
    }
    allEntries.sort((a, b) => b.timestamp - a.timestamp);
    const recent = allEntries.slice(0, 50);

    if (recent.length === 0) {
      feedEl.innerHTML = '<div style="color:#666;padding:12px;text-align:center;">No activity yet</div>';
    } else {
      feedEl.innerHTML = recent.map(item => `
        <div class="af-item">
          <span class="af-dot" style="background:${item.color}"></span>
          <span class="af-name">${esc(item.empName)}</span>
          <span class="af-action">${esc(item.action)}</span>
          <span class="af-price text-green">${money(item.price)}</span>
          ${item.timestamp ? `<span class="af-time">${timeAgo(item.timestamp)}</span>` : ''}
        </div>
      `).join('');
    }
  }

  // --- Roster ---
  const rosterEl = $('crewRoster');
  if (!rosterEl) return;

  let filtered = state.employees;
  if (crewFilter === 'active') filtered = filtered.filter(e => e.active);
  else if (crewFilter === 'inactive') filtered = filtered.filter(e => !e.active);

  if (filtered.length === 0) {
    rosterEl.innerHTML = '<div style="color:#666;padding:12px;text-align:center;">No employees found</div>';
    return;
  }

  rosterEl.innerHTML = filtered.map(emp => {
    const role = getRole(emp.roleId);
    const sales = calcEmployeeSales(emp.id);
    const commission = calcEmployeeCommission(emp.id);
    const svcCount = calcEmployeeServiceCount(emp.id);
    const color = role ? role.color : '#666';

    let badge = '';
    if (!emp.active) {
      badge = '<span class="crew-gone-badge">Inactive</span>';
    }

    return `
      <div class="crew-card${emp.active ? '' : ' inactive'}">
        <div class="crew-card-top">
          <div class="crew-card-identity">
            <span class="crew-card-dot" style="background:${color}"></span>
            <span class="crew-card-name">${esc(emp.name)}</span>
            <span class="crew-card-id">#${esc(emp.stateId)}</span>
            ${role ? `<span style="color:${color};font-size:11px;font-weight:600;">${esc(role.name)}</span>` : ''}
          </div>
          ${badge}
        </div>
        <div class="crew-card-stats">
          <div class="crew-card-stat"><span class="crew-card-stat-val text-green">${money(sales)}</span><span class="crew-card-stat-lbl">Sales</span></div>
          <div class="crew-card-stat"><span class="crew-card-stat-val text-amber">${money(commission)}</span><span class="crew-card-stat-lbl">Commission</span></div>
          <div class="crew-card-stat"><span class="crew-card-stat-val">${svcCount}</span><span class="crew-card-stat-lbl">Services</span></div>
        </div>
      </div>
    `;
  }).join('');
}
