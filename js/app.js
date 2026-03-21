import { $, uid, esc, safeColor } from './utils.js?v=20260321';
import { state, STORAGE_KEY, saveState, getRole, calcEmployeeSales, calcEmployeeCommission } from './state.js?v=20260321';
import { FIREBASE_URL, loadFromFirebase, pushToFirebase, flushSync, markInitialLoadDone,
         onRemoteUpdate, startStreaming, migrateLegacyData } from './firebase.js?v=20260321';
import { shopId } from './shop.js?v=20260321';
import { hideModal, showConfirmModal } from './modals.js?v=20260321';
import { isUnlocked, getAccessLevel, lockOut, restoreSession,
         checkPasscodeExists, showUnlockModal, showSetPasscodeModal,
         showChangePasscodeModal, showEmployeePasscodeModal } from './auth.js?v=20260321';
import { renderDashboard } from './dashboard.js?v=20260321';
import { renderCommissions } from './commissions.js?v=20260321';
import { renderEmployees } from './employees.js?v=20260321';
import { renderSettings } from './settings.js?v=20260321';
import { renderCrew } from './crew.js?v=20260321';
import { exportCsv, exportJson, importJson } from './data.js?v=20260321';

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

// === BRANDING ===
export function applyBranding() {
  const logo = document.querySelector('.header-logo');
  if (logo) logo.src = state.shopLogo || 'Logo_a_ds.png';
  const name = state.shopName || shopId.charAt(0).toUpperCase() + shopId.slice(1);
  document.title = name + ' - Commission Tracker';
  if (logo) logo.alt = name;
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

  // Safety net: always hide loader after 12 seconds max
  const loaderTimeout = setTimeout(() => {
    if (loader) loader.style.display = 'none';
  }, 12000);

  // No shop selected - show picker
  if (!shopId) {
    if (loader) loader.style.display = 'none';
    $('appRoot').style.display = 'none';
    $('shopPicker').style.display = '';
    await initShopPicker();
    return;
  }

  // Apply branding from state (logo + title)
  applyBranding();

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
    const name = $('newEmpName').value.trim().slice(0, 64);
    const stateId = $('newEmpStateId').value.trim().slice(0, 64);
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
        color: safeColor(role ? role.color : '#666'),
        gross,
        commission: comm,
        timestamp: Date.now()
      });
      state.work[state.selectedEmployeeId] = { inventory: {}, entries: [] };
      render();
      flushSync();
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
    state.services.push({ id: newId, name: 'New Service', price: 0, eventPrice: 0, commission: 0, category: 'service', group: '' });
    render();
  };

  // Settings: Add service group
  $('addGroupBtn').onclick = () => {
    const newId = 'grp_' + Date.now();
    const maxOrder = state.serviceGroups.reduce((m, g) => Math.max(m, g.sortOrder ?? 0), -1);
    state.serviceGroups.push({ id: newId, name: 'New Group', color: '#888888', sortOrder: maxOrder + 1 });
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

  // Startup: verify shop exists, migrate legacy data, then load
  try {
    // Check that this shop was properly created (has a name/created entry)
    const shopMeta = await fetch(FIREBASE_URL + '/shops/' + encodeURIComponent(shopId) + '/name.json');
    if (!shopMeta.ok) throw new Error('HTTP ' + shopMeta.status);
    const shopName = await shopMeta.json();
    if (!shopName || typeof shopName !== 'string') {
      // Shop was never created through the invite code flow — redirect to picker
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = window.location.pathname;
      return;
    }

    await migrateLegacyData();
    await loadFromFirebase();
    // Update last-seen timestamp
    await fetch(FIREBASE_URL + '/shops/' + encodeURIComponent(shopId) + '.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSeen: Date.now() })
    });
    // Apply branding after Firebase data loads
    applyBranding();
  } catch { /* continue with local data */ }
  markInitialLoadDone();
  fromRemote = true;
  switchTab(currentTab);
  fromRemote = false;

  // Hide loading overlay
  clearTimeout(loaderTimeout);
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
import { getShopUrl } from './shop.js?v=20260321';
import { hashPasscode as hashAdmin, verifyPasscode as verifyAdmin, generateCode } from './utils.js?v=20260321';

async function initShopPicker() {
  const nameInput = $('newShopName');
  const codeInput = $('shopInviteCode');
  const createBtn = $('createShopBtn');
  const errorEl = $('shopCreateError');

  // Auto-register Dreamworks if legacy root data exists but no shop entry yet
  try {
    const res = await fetch(FIREBASE_URL + '/shops.json');
    let data = await res.json();
    if (!data || !data.dreamworks) {
      const legacyRes = await fetch(FIREBASE_URL + '/state.json');
      const legacyData = await legacyRes.json();
      if (legacyData) {
        await fetch(FIREBASE_URL + '/shops/dreamworks.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Dreamworks Customs', created: Date.now() })
        });
      }
    }
  } catch { /* offline */ }

  // Create new shop (requires invite code)
  createBtn.onclick = async () => {
    const raw = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    if (!raw) { errorEl.textContent = 'Enter a shop name.'; return; }
    if (!code) { errorEl.textContent = 'Enter an invite code.'; return; }
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || slug.length < 2) { errorEl.textContent = 'Name must be at least 2 characters (letters/numbers).'; return; }
    if (slug.length > 48) { errorEl.textContent = 'Name is too long.'; return; }
    errorEl.textContent = '';

    try {
      // Validate invite code
      const codeRes = await fetch(FIREBASE_URL + '/inviteCodes/' + encodeURIComponent(code) + '.json');
      const codeData = await codeRes.json();
      if (!codeData) { errorEl.textContent = 'Invalid invite code.'; return; }
      if (codeData.usedBy) { errorEl.textContent = 'This invite code has already been used.'; return; }

      // Check if shop already exists
      const check = await fetch(FIREBASE_URL + '/shops/' + encodeURIComponent(slug) + '.json');
      const existing = await check.json();
      if (existing) { errorEl.textContent = 'A shop with that name already exists.'; return; }

      // Mark invite code as used
      await fetch(FIREBASE_URL + '/inviteCodes/' + encodeURIComponent(code) + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usedBy: slug, usedAt: Date.now() })
      });

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
  codeInput.onkeydown = (e) => { if (e.key === 'Enter') createBtn.click(); };

  // === ADMIN PANEL ===
  const adminToggle = $('adminToggleBtn');
  const adminPanel = $('adminPanel');
  const adminLoginArea = $('adminLoginArea');
  const adminControls = $('adminControls');
  const adminPassInput = $('adminPasscode');
  const adminLoginBtn = $('adminLoginBtn');
  const adminError = $('adminError');
  const generateBtn = $('generateCodeBtn');
  const codeDisplay = $('generatedCodeDisplay');
  const codeText = $('generatedCodeText');
  const codeListEl = $('inviteCodeList');

  adminToggle.onclick = () => {
    adminPanel.style.display = adminPanel.style.display === 'none' ? '' : 'none';
  };

  adminLoginBtn.onclick = async () => {
    const pass = adminPassInput.value;
    if (!pass) { adminError.textContent = 'Enter admin passcode.'; return; }
    adminError.textContent = '';

    try {
      const res = await fetch(FIREBASE_URL + '/admin/passcode.json');
      const stored = await res.json();

      if (!stored) {
        // First time - set admin passcode
        const hashed = await hashAdmin(pass);
        await fetch(FIREBASE_URL + '/admin/passcode.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hashed)
        });
        adminLoginArea.style.display = 'none';
        adminControls.style.display = '';
        loadInviteCodes();
        return;
      }

      const valid = await verifyAdmin(pass, stored);
      if (!valid) { adminError.textContent = 'Incorrect passcode.'; return; }

      adminLoginArea.style.display = 'none';
      adminControls.style.display = '';
      loadInviteCodes();
    } catch {
      adminError.textContent = 'Connection error.';
    }
  };

  adminPassInput.onkeydown = (e) => { if (e.key === 'Enter') adminLoginBtn.click(); };

  generateBtn.onclick = async () => {
    const newCode = generateCode();
    try {
      await fetch(FIREBASE_URL + '/inviteCodes/' + encodeURIComponent(newCode) + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ created: Date.now(), usedBy: null })
      });
      codeText.textContent = newCode;
      codeDisplay.style.display = '';
      loadInviteCodes();
    } catch {
      adminError.textContent = 'Failed to generate code.';
    }
  };

  async function loadInviteCodes() {
    try {
      const res = await fetch(FIREBASE_URL + '/inviteCodes.json');
      const data = await res.json();
      codeListEl.innerHTML = '';
      if (!data) return;
      const codes = Object.entries(data).sort((a, b) => (b[1].created || 0) - (a[1].created || 0));
      for (const [code, info] of codes) {
        const div = document.createElement('div');
        div.className = 'invite-code-item' + (info.usedBy ? ' used' : '');
        const statusText = info.usedBy ? `Used by ${info.usedBy}` : 'Available';
        div.innerHTML = `<span class="code">${esc(code)}</span><span class="status">${esc(statusText)}</span>`;
        codeListEl.appendChild(div);
      }
    } catch { /* offline */ }
  }
}
