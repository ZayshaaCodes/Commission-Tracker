import { $, uid } from './utils.js';
import { state, saveState } from './state.js';
import { FIREBASE_URL, loadFromFirebase, pushToFirebase, markInitialLoadDone,
         onRemoteUpdate, startStreaming } from './firebase.js';
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
  const crewTab = document.querySelector('[data-tab="crew"]');
  if (settingsTab) settingsTab.style.display = level === 'owner' ? '' : 'none';
  if (employeesTab) employeesTab.style.display = level === 'owner' ? '' : 'none';
  if (crewTab) crewTab.style.display = level === 'owner' ? '' : 'none';

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
    showConfirmModal('Clear all logged services for this employee?', () => {
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
        await fetch(FIREBASE_URL + '/state.json', { method: 'DELETE' });
      } catch { /* continue with local reset even if remote fails */ }
      localStorage.removeItem('saa_commission_tracker');
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

  // Startup: load from Firebase FIRST, then render
  try {
    await loadFromFirebase();
  } catch { /* continue with local data */ }
  markInitialLoadDone();
  fromRemote = true;
  switchTab(currentTab);
  fromRemote = false;

  // Hide loading overlay
  const loader = $('loadingOverlay');
  if (loader) loader.style.display = 'none';

  // Start real-time streaming
  startStreaming();
}

init().catch(err => {
  console.error('Init failed:', err);
  const loader = $('loadingOverlay');
  if (loader) loader.style.display = 'none';
});
