import { $, money, esc, timeAgo, uid } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWork,
         calcEmployeeSales, calcEmployeeCommission, saveState } from './state.js';
import { renderTimeline, renderSalesChart } from './dashboard.js';
import { showConfirmModal } from './modals.js';
import { render } from './app.js';

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

  // --- Weekly Payout Button ---
  const payoutBtn = $('weeklyPayoutBtn');
  if (payoutBtn) {
    payoutBtn.onclick = () => {
      if (totalSales === 0) return;
      showConfirmModal('Process weekly payout? This will log all current earnings and clear employee data.', () => {
        const lines = [];
        for (const emp of state.employees) {
          const gross = calcEmployeeSales(emp.id);
          const comm = calcEmployeeCommission(emp.id);
          if (gross === 0) continue;
          const role = getRole(emp.roleId);
          lines.push({ empName: emp.name, roleId: emp.roleId, color: role ? role.color : '#666', gross, commission: comm });
        }
        if (!Array.isArray(state.payoutHistory)) state.payoutHistory = [];
        state.payoutHistory.unshift({
          id: uid(),
          timestamp: Date.now(),
          totalSales,
          totalCommission,
          net: totalSales - totalCommission,
          employees: lines
        });
        // Clear all work
        for (const emp of state.employees) {
          state.work[emp.id] = { inventory: {}, entries: [] };
        }
        // Log to activity feed
        if (!Array.isArray(state.activityLog)) state.activityLog = [];
        state.activityLog.push({
          id: uid(),
          type: 'payout',
          gross: totalSales,
          commission: totalCommission,
          timestamp: Date.now()
        });
        render();
      });
    };
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
    // Include activity log entries (clears & payouts)
    if (Array.isArray(state.activityLog)) {
      for (const log of state.activityLog) {
        if (log.type === 'clear') {
          allEntries.push({
            empName: log.empName,
            color: log.color || '#666',
            action: `Cleared — Gross: ${money(log.gross)}, Commission: ${money(log.commission)}`,
            price: 0,
            timestamp: log.timestamp,
            isMeta: true
          });
        } else if (log.type === 'payout') {
          allEntries.push({
            empName: 'System',
            color: '#f59e0b',
            action: `Weekly Payout — Gross: ${money(log.gross)}, Commission: ${money(log.commission)}`,
            price: 0,
            timestamp: log.timestamp,
            isMeta: true
          });
        }
      }
    }
    allEntries.sort((a, b) => b.timestamp - a.timestamp);
    const recent = allEntries.slice(0, 50);

    if (recent.length === 0) {
      feedEl.innerHTML = '<div style="color:#666;padding:12px;text-align:center;">No activity yet</div>';
    } else {
      feedEl.innerHTML = recent.map(item => {
        if (item.isMeta) {
          return `
            <div class="af-item af-meta">
              <span class="af-dot" style="background:${item.color}"></span>
              <span class="af-name">${esc(item.empName)}</span>
              <span class="af-action">${esc(item.action)}</span>
              ${item.timestamp ? `<span class="af-time">${timeAgo(item.timestamp)}</span>` : ''}
            </div>`;
        }
        return `
          <div class="af-item">
            <span class="af-dot" style="background:${item.color}"></span>
            <span class="af-name">${esc(item.empName)}</span>
            <span class="af-action">${esc(item.action)}</span>
            <span class="af-price text-green">${money(item.price)}</span>
            ${item.timestamp ? `<span class="af-time">${timeAgo(item.timestamp)}</span>` : ''}
          </div>`;
      }).join('');
    }
  }

  // --- Payout History ---
  const historyEl = $('payoutHistory');
  if (historyEl) {
    if (!Array.isArray(state.payoutHistory) || state.payoutHistory.length === 0) {
      historyEl.innerHTML = '<div style="color:#666;padding:12px;text-align:center;">No payouts yet</div>';
    } else {
      historyEl.innerHTML = state.payoutHistory.map(p => {
        const date = new Date(p.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const empLines = p.employees.map(e =>
          `<div class="ph-emp"><span class="ph-emp-name">${esc(e.empName)}</span><span class="ph-emp-gross text-green">${money(e.gross)}</span><span class="ph-emp-comm text-amber">${money(e.commission)}</span></div>`
        ).join('');
        return `
          <div class="ph-entry">
            <div class="ph-header">
              <span class="ph-date">${dateStr} ${timeStr}</span>
              <span class="ph-totals">Gross: <span class="text-green">${money(p.totalSales)}</span> &middot; Commission: <span class="text-amber">${money(p.totalCommission)}</span> &middot; Net: <span class="text-blue">${money(p.net)}</span></span>
            </div>
            <div class="ph-employees">${empLines}</div>
          </div>`;
      }).join('');
    }
  }

}
