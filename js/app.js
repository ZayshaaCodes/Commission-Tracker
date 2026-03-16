import { $, uid } from './utils.js';
import { state, STORAGE_KEY, saveState, getRole, calcEmployeeSales, calcEmployeeCommission } from './state.js';
import { FIREBASE_URL, loadFromFirebase, pushToFirebase, markInitialLoadDone,
         onRemoteUpdate, startStreaming, migrateLegacyData } from './firebase.js';
import { shopId } from './shop.js';
import { hideModal, showConfirmModal } from './modals.js';
import { isUnlocked, getAccessLevel, lockOut, restoreSession,
         checkPasscodeExists, showUnlockModal, showSetPasscodeModal,
         showChangePasscodeModal, showEmployeePasscodeModal } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderCommissions } from './commissions.js';
import { renderEmployees } from './employees.js';
import { renderSettings } from './settings.js';
import { renderCrew } from './crew.js';
import { exportCsv, exportJson, importJson } from './data.js';

// === TAB SWITCHING ===
let currentTab = sessionStorage.getItem('currentTab') || 'dashboard';

function switchTab(tab) {
  currentTab = tab;
  sessionStorage.setItem('currentTab', tab);
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const tabEl = $(tab + 'Tab');
  if (tabEl) tabEl.classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  render();
}

// === RENDER ===
let fromRemote = false;

export function render() {
  switch (currentTab) {
    case 'dashboard': renderDashboard(); break;
    case 'commissions': renderCommissions(); break;
    case 'stats': renderCrew(); break;
    case 'employees': renderEmployees(); break;
    case 'settings': renderSettings(); break;
  }
  if (!fromRemote) saveState();
}

// === LOCK STATE UI ===
function applyLockState() {
  const level = getAccessLevel();
  document.body.classList.remove('locked', 'access-employee');
  if (level === 'viewer') document.body.classList.add('locked');
  else if (level === 'employee') document.body.classList.add('access-employee');

  const lockBtn = $('lockToggle');
  if (lockBtn) {
    const labels = { viewer: '🔒 Locked', employee: '🔓 Employee', owner: '🔓 Owner' };
    const classes = { viewer: 'btn small', employee: 'btn small primary', owner: 'btn small success' };
    lockBtn.textContent = labels[level];
    lockBtn.className = classes[level];
  }

  const settingsTab = document.querySelector('[data-tab="settings"]');
  const employeesTab = document.querySelector('[data-tab="employees"]');
  const statsTab = document.querySelector('[data-tab="stats"]');
  if (settingsTab) settingsTab.style.display = level === 'owner' ? '' : 'none';
  if (employeesTab) employeesTab.style.display = level === 'owner' ? '' : 'none';
  if (statsTab) statsTab.style.display = level === 'owner' ? '' : 'none';

  if (level !== 'owner' && (currentTab === 'settings' || currentTab === 'employees' || currentTab === 'stats')) {
    switchTab('dashboard');
  }
}

// === FIREBASE REMOTE UPDATE CALLBACK ===
onRemoteUpdate(() => {
  fromRemote = true;
  render();
  fromRemote = false;
});

// === INIT ===
async function init() {
  const loader = $('loadingOverlay');

  // No shop selected — show picker
  if (!shopId) {
    if (loader) loader.style.display = 'none';
    $('appRoot').style.display = 'none';
    $('shopPicker').style.display = '';
    await initShopPicker();
    return;
  }

  // Set page title to shop name
  document.title = shopId.charAt(0).toUpperCase() + shopId.slice(1) + ' — Commission Tracker';

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Event mode
  $('eventModeToggle').checked = state.eventMode;
  $('eventModeToggle').onchange = () => {
    state.eventMode = $('eventModeToggle').checked;
    render();
  };

  // Add employee
  $('addEmployeeBtn').onclick = () => {
    const name = $('newEmpName').value.trim();
    const stateId = $('newEmpStateId').value.trim();
    const roleId = $('newEmpRole').value;
    if (!name) return;

    state.employees.push({
      id: uid(),
      name,
      stateId,
      roleId,
      active: true,
      joinDate: Date.now()
    });

    $('newEmpName').value = '';
    $('newEmpStateId').value = '';
    render();
  };

  // Employee filter
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.employeeFilter = btn.dataset.filter;
      renderEmployees();
    });
  });

  // Clear employee work
  $('clearEmployeeWork').onclick = () => {
    if (!state.selectedEmployeeId) return;
    const emp = state.employees.find(e => e.id === state.selectedEmployeeId);
    if (!emp) return;
    const gross = calcEmployeeSales(emp.id);
    const comm = calcEmployeeCommission(emp.id);
    if (gross === 0) {
      showConfirmModal('Clear all logged services for this employee?', () => {
        state.work[state.selectedEmployeeId] = { inventory: {}, entries: [] };
        render();
      });
      return;
    }
    showConfirmModal('Clear all logged services for this employee?', () => {
      const role = getRole(emp.roleId);
      if (!Array.isArray(state.activityLog)) state.activityLog = [];
      state.activityLog.push({
        id: uid(),
        type: 'clear',
        empName: emp.name,
        color: role ? role.color : '#666',
        gross,
        commission: comm,
        timestamp: Date.now()
      });
      state.work[state.selectedEmployeeId] = { inventory: {}, entries: [] };
      render();
    });
  };

  // Settings: Add role
  $('addRoleBtn').onclick = () => {
    const newId = 'role_' + Date.now();
    state.roles.push({ id: newId, name: 'New Role', commission: 0, color: '#94a3b8' });
    render();
  };

  // Settings: Add service
  $('addServiceBtn').onclick = () => {
    const newId = 'svc_' + Date.now();
    state.services.push({ id: newId, name: 'New Service', price: 0, eventPrice: 0, category: 'service' });
    render();
  };

  // Settings: Firebase sync
  $('firebaseForceSync').onclick = () => {
    $('firebaseStatus').textContent = 'Syncing...';
    $('firebaseStatus').style.color = '#60a5fa';
    pushToFirebase().then(() => {
      $('firebaseStatus').textContent = 'Force sync complete!';
      $('firebaseStatus').style.color = '#4ade80';
    });
  };

  // Data management
  $('exportCsvBtn').onclick = exportCsv;
  $('exportJsonBtn').onclick = exportJson;
  $('importJsonBtn').onclick = () => $('importJsonFile').click();
  $('importJsonFile').onchange = (e) => {
    if (e.target.files[0]) importJson(e.target.files[0], () => render());
    e.target.value = '';
  };

  $('resetAllBtn').onclick = () => {
    showConfirmModal('Reset ALL data to defaults? This will clear both local and remote data. This cannot be undone.', async () => {
      try {
        await fetch(`${FIREBASE_URL}/shops/${shopId}/state.json`, { method: 'DELETE' });
      } catch { /* continue with local reset even if remote fails */ }
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  };

  // Modal overlay click to close
  $('modalOverlay').onclick = (e) => {
    if (e.target === $('modalOverlay')) hideModal();
  };

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });

  // Lock toggle button
  const onAuthChange = () => { applyLockState(); render(); };
  $('lockToggle').onclick = async () => {
    if (isUnlocked()) {
      lockOut();
      applyLockState();
      render();
    } else {
      const exists = await checkPasscodeExists();
      if (exists) {
        showUnlockModal(onAuthChange);
      } else {
        showSetPasscodeModal(onAuthChange);
      }
    }
  };

  // Change passcodes (owner settings)
  $('changePasscodeBtn').onclick = () => showChangePasscodeModal();
  $('changeEmpPasscodeBtn').onclick = () => showEmployeePasscodeModal();

  // Restore session access level
  restoreSession();
  applyLockState();

  // Startup: migrate legacy data if needed, then load
  try {
    await migrateLegacyData();
    await loadFromFirebase();
    // Ensure shop is registered in the index
    await fetch(FIREBASE_URL + '/shops/' + encodeURIComponent(shopId) + '.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: shopId, lastSeen: Date.now() })
    });
  } catch { /* continue with local data */ }
  markInitialLoadDone();
  fromRemote = true;
  switchTab(currentTab);
  fromRemote = false;

  // Hide loading overlay
  if (loader) loader.style.display = 'none';

  // Start real-time streaming
  startStreaming();
}

init().catch(err => {
  console.error('Init failed:', err);
  const loader = $('loadingOverlay');
  if (loader) loader.style.display = 'none';
});

// === SHOP PICKER ===
import { getShopUrl } from './shop.js';

async function initShopPicker() {
  const listEl = $('shopList');
  const nameInput = $('newShopName');
  const createBtn = $('createShopBtn');
  const errorEl = $('shopCreateError');

  // Load registered shops from Firebase
  try {
    const res = await fetch(FIREBASE_URL + '/shops.json');
    const data = await res.json();
    if (data && typeof data === 'object') {
      const shopIds = Object.keys(data).sort();
      for (const id of shopIds) {
        const a = document.createElement('a');
        a.className = 'shop-list-item';
        a.href = getShopUrl(id);
        a.textContent = data[id].name || id;
        listEl.appendChild(a);
      }
    }
  } catch { /* offline — show empty */ }

  if (!listEl.children.length) {
    listEl.innerHTML = '<div class="shop-list-empty">No shops registered yet</div>';
  }

  // Create new shop
  createBtn.onclick = async () => {
    const raw = nameInput.value.trim();
    if (!raw) { errorEl.textContent = 'Enter a shop name.'; return; }
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || slug.length < 2) { errorEl.textContent = 'Name must be at least 2 characters (letters/numbers).'; return; }
    if (slug.length > 48) { errorEl.textContent = 'Name is too long.'; return; }
    errorEl.textContent = '';

    try {
      // Check if shop already exists
      const check = await fetch(FIREBASE_URL + '/shops/' + encodeURIComponent(slug) + '.json');
      const existing = await check.json();
      if (existing) { errorEl.textContent = 'A shop with that name already exists.'; return; }

      // Register the shop
      await fetch(FIREBASE_URL + '/shops/' + encodeURIComponent(slug) + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: raw, created: Date.now() })
      });

      // Navigate to the new shop
      window.location.href = getShopUrl(slug);
    } catch {
      errorEl.textContent = 'Failed to create shop. Check your connection.';
    }
  };

  nameInput.onkeydown = (e) => { if (e.key === 'Enter') createBtn.click(); };
}
