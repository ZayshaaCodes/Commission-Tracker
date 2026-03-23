import { $, money, esc, timeAgo, uid, safeColor } from './utils.js';
import { state, getRole, getService, getServicePrice, getEmployeeWork,
         calcEmployeeSales, calcEmployeeCommission, saveState, logActivity } from './state.js';
import { renderTimeline, renderSalesChart } from './dashboard.js';
import { showConfirmModal } from './modals.js';
import { render } from './app.js';
import { flushSync } from './firebase.js';

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
          lines.push({ empName: emp.name, roleId: emp.roleId, color: safeColor(role ? role.color : '#666'), gross, commission: comm });
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
        if (!state.workClears) state.workClears = {};
        const clearTs = Date.now();
        for (const emp of state.employees) {
          state.workClears[emp.id] = clearTs;
          state.work[emp.id] = { inventory: {}, entries: [] };
        }
        // Log to activity feed
        logActivity({
          type: 'payout',
          gross: totalSales,
          commission: totalCommission
        });
        render();
        flushSync();
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
    const entries = Array.isArray(state.activityLog)
      ? [...state.activityLog].sort((a, b) => b.timestamp - a.timestamp)
      : [];

    if (entries.length === 0) {
      feedEl.innerHTML = '<div style="color:#666;padding:12px;text-align:center;">No activity yet</div>';
    } else {
      feedEl.innerHTML = entries.map(item => {
        switch (item.type) {
          case 'service':
            return `
              <div class="af-item">
                <span class="af-dot" style="background:${item.color}"></span>
                <span class="af-name">${esc(item.empName)}</span>
                <span class="af-action">${esc(item.serviceName)}</span>
                <span class="af-price text-green">+${money(item.price)}</span>
                <span class="af-time">${timeAgo(item.timestamp)}</span>
              </div>`;
          case 'inventory':
            return `
              <div class="af-item">
                <span class="af-dot" style="background:${item.color}"></span>
                <span class="af-name">${esc(item.empName)}</span>
                <span class="af-action">${esc(item.serviceName)} x${item.quantity}</span>
                <span class="af-price text-green">+${money(item.unitPrice * item.quantity)}</span>
                <span class="af-time">${timeAgo(item.timestamp)}</span>
              </div>`;
          case 'inv-remove':
            return `
              <div class="af-item af-meta af-removal">
                <span class="af-dot" style="background:#f87171"></span>
                <span class="af-name">${esc(item.empName)}</span>
                <span class="af-action">Removed ${esc(item.serviceName)}${item.quantity > 1 ? ' x' + item.quantity : ''}</span>
                <span class="af-price text-red">-${money(item.unitPrice * item.quantity)}</span>
                <span class="af-time">${timeAgo(item.timestamp)}</span>
              </div>`;
          case 'remove':
            return `
              <div class="af-item af-meta af-removal">
                <span class="af-dot" style="background:#f87171"></span>
                <span class="af-name">${esc(item.empName)}</span>
                <span class="af-action">Removed ${esc(item.serviceName)}</span>
                ${item.price ? `<span class="af-price text-red">-${money(item.price)}</span>` : ''}
                <span class="af-time">${timeAgo(item.timestamp)}</span>
              </div>`;
          case 'clear':
            return `
              <div class="af-item af-meta">
                <span class="af-dot" style="background:${safeColor(item.color || '#666')}"></span>
                <span class="af-name">${esc(item.empName)}</span>
                <span class="af-action">Cleared &mdash; Gross: ${money(item.gross)}, Comm: ${money(item.commission)}</span>
                <span class="af-time">${timeAgo(item.timestamp)}</span>
              </div>`;
          case 'payout':
            return `
              <div class="af-item af-meta">
                <span class="af-dot" style="background:#f59e0b"></span>
                <span class="af-name">System</span>
                <span class="af-action">Weekly Payout &mdash; Gross: ${money(item.gross)}, Comm: ${money(item.commission)}</span>
                <span class="af-time">${timeAgo(item.timestamp)}</span>
              </div>`;
          default:
            return '';
        }
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
