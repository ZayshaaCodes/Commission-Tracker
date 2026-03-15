import { $, money, esc, timeAgo } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWork,
         calcEmployeeSales, calcEmployeeCommission } from './state.js';
import { renderTimeline, renderSalesChart } from './dashboard.js';

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
      <div class="crew-stat"><span class="crew-stat-lbl">Active</span><span class="crew-stat-val">${active}</span></div>
      <div class="crew-stat"><span class="crew-stat-lbl">Inactive</span><span class="crew-stat-val">${inactive}</span></div>
      <div class="crew-stat"><span class="crew-stat-lbl">Gross Sales</span><span class="crew-stat-val text-green">${money(totalSales)}</span></div>
      <div class="crew-stat"><span class="crew-stat-lbl">Commission</span><span class="crew-stat-val text-amber">${money(totalCommission)}</span></div>
      <div class="crew-stat"><span class="crew-stat-lbl">Net</span><span class="crew-stat-val text-blue">${money(totalSales - totalCommission)}</span></div>
    `;
  }

  // --- Charts ---
  const activeEmps = state.employees.filter(e => e.active);
  renderTimeline();
  renderSalesChart(activeEmps);

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
      for (const log of work.inventoryLog) {
        const svc = getService(log.serviceId);
        allEntries.push({
          empName: emp.name,
          color: role ? role.color : '#666',
          action: svc ? `${svc.name} x${log.quantity}` : 'Unknown',
          price: getServicePrice(log.serviceId) * log.quantity,
          timestamp: log.timestamp
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

}
