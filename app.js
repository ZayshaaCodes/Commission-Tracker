(() => {
  // === DOM HELPERS ===
  const $ = (id) => document.getElementById(id);
  const money = (n) => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
  const uid = () => crypto.randomUUID();

  // === DEFAULT DATA ===
  const DEFAULT_ROLES = [
    { id: 'owner', name: 'Owner', commission: 0, color: '#22c55e' },
    { id: 'head_manager', name: 'Head Manager', commission: 50, color: '#7c3aed' },
    { id: 'manager', name: 'Manager', commission: 45, color: '#eab308' },
    { id: 'master_tech', name: 'Master Tech', commission: 40, color: '#06b6d4' },
    { id: 'senior_mechanic', name: 'Senior Mechanic', commission: 30, color: '#f97316' },
    { id: 'mechanic', name: 'Mechanic', commission: 25, color: '#94a3b8' }
  ];

  const DEFAULT_SERVICES = [
    { id: 'lockpick', name: 'Lockpick', price: 25, eventPrice: 13, category: 'inventory' },
    { id: 'clean_kit', name: 'Clean Kit', price: 25, eventPrice: 13, category: 'inventory' },
    { id: 'repair_kit', name: 'Repair Kit', price: 100, eventPrice: 50, category: 'inventory' },
    { id: 'adv_repair_kit', name: 'Adv. Repair Kit', price: 250, eventPrice: 125, category: 'inventory' },
    { id: 'body_repair', name: 'Body Repair', price: 50, eventPrice: 25, category: 'service' },
    { id: 'gov_internals', name: 'Gov Internals', price: 0, eventPrice: 0, category: 'service' },
    { id: 'gov_hg_internals', name: 'Gov HG Internals', price: 0, eventPrice: 0, category: 'service' },
    { id: 'city_tow', name: 'City Tow', price: 700, eventPrice: 350, category: 'service' },
    { id: 'county_tow', name: 'County Tow', price: 900, eventPrice: 450, category: 'service' },
    { id: 'internals', name: 'Internals', price: 500, eventPrice: 350, category: 'service' },
    { id: 'hg_internals', name: 'HG Internals', price: 1000, eventPrice: 450, category: 'service' },
    { id: 'engine_upgrade', name: 'Engine Upgrade', price: 2500, eventPrice: 250, category: 'service' },
    { id: 'brake_upgrade', name: 'Brake Upgrade', price: 2500, eventPrice: 500, category: 'service' },
    { id: 'trans_upgrade', name: 'Transmission Upgrade', price: 2500, eventPrice: 1250, category: 'service' },
    { id: 'sus_upgrade', name: 'Suspension Upgrade', price: 2500, eventPrice: 1250, category: 'service' },
    { id: 'license_plate', name: 'License Plate', price: 4000, eventPrice: 1250, category: 'service' },
    { id: 'turbo', name: 'Turbo', price: 5000, eventPrice: 1250, category: 'service' },
    { id: 'harness', name: 'Harness', price: 5000, eventPrice: 2000, category: 'service' },
    { id: 'killswitch', name: 'Killswitch', price: 5000, eventPrice: 2500, category: 'service' },
    { id: 'employee_upgrade', name: 'Employee Upgrade', price: 7500, eventPrice: 2500, category: 'service' },
    { id: 'max_upgrade', name: 'Max Upgrade', price: 10000, eventPrice: 2500, category: 'service' },
    { id: 'suspension_work', name: 'Suspension Work', price: 25000, eventPrice: 3750, category: 'service' }
  ];

  const DEFAULT_EMPLOYEES = [
    { id: uid(), name: 'Cara Wobbles', stateId: '1434', roleId: 'owner', active: true },
    { id: uid(), name: 'Trey Miller', stateId: '3654', roleId: 'owner', active: true },
    { id: uid(), name: 'Axle Waxle', stateId: '901', roleId: 'head_manager', active: true },
    { id: uid(), name: 'Rod Blackwash', stateId: '1250', roleId: 'head_manager', active: true },
    { id: uid(), name: 'Jeff', stateId: '468', roleId: 'head_manager', active: true },
    { id: uid(), name: 'Dan Sanders', stateId: '1743', roleId: 'manager', active: true },
    { id: uid(), name: 'Nathan Black', stateId: '888', roleId: 'manager', active: true },
    { id: uid(), name: 'Shawn Howard', stateId: '4357', roleId: 'manager', active: true },
    { id: uid(), name: 'Brett Wescott', stateId: '5141', roleId: 'master_tech', active: true }
  ];

  const DEFAULT_GOLD_PRICING = [
    { min: 1, max: 5, price: 200 },
    { min: 6, max: 12, price: 300 },
    { min: 12, max: 19, price: 500 },
    { min: 20, max: 25, price: 750 },
    { min: 26, max: Infinity, price: 1000 }
  ];

  // === PERSISTENCE ===
  const STORAGE_KEY = 'saa_commission_tracker';
  // Firebase Realtime Database URL
  const FIREBASE_URL = 'https://dreamworks-commission-default-rtdb.firebaseio.com';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleSync();
  }

  // === STATE ===
  const saved = loadState();
  let state = saved || {
    roles: structuredClone(DEFAULT_ROLES),
    services: structuredClone(DEFAULT_SERVICES),
    employees: DEFAULT_EMPLOYEES,
    // Per-employee work data: { [employeeId]: { inventory: {serviceId: qty}, entries: [{id, serviceId, timestamp}] } }
    work: {},
    goldPricing: structuredClone(DEFAULT_GOLD_PRICING),
    eventMode: false,
    selectedEmployeeId: null,
    employeeFilter: 'active'
  };

  // Ensure all state keys exist (for older saved states)
  if (!state.work) state.work = {};
  if (!state.goldPricing) state.goldPricing = structuredClone(DEFAULT_GOLD_PRICING);
  // Clean up old sheetsConfig if present
  delete state.sheetsConfig;

  // === UTILITIES ===
  // Simple SHA-256 implementation that works on file:// (no crypto.subtle needed)
  function hashPasscode(code) {
    // djb2-based hash — not cryptographic, but sufficient for a client-side passcode
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < code.length; i++) {
      const ch = code.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // === LOCK / UNLOCK ===
  // Access levels: 'viewer' (read-only), 'employee' (commissions editing), 'owner' (full access)
  let accessLevel = 'viewer';

  function isUnlocked() { return accessLevel !== 'viewer'; }
  function isOwner() { return accessLevel === 'owner'; }

  function applyLockState() {
    document.body.classList.remove('locked', 'access-employee');
    if (accessLevel === 'viewer') document.body.classList.add('locked');
    else if (accessLevel === 'employee') document.body.classList.add('access-employee');

    const lockBtn = $('lockToggle');
    if (lockBtn) {
      const labels = { viewer: '🔒 Locked', employee: '🔓 Employee', owner: '🔓 Owner' };
      const classes = { viewer: 'btn small', employee: 'btn small primary', owner: 'btn small success' };
      lockBtn.textContent = labels[accessLevel];
      lockBtn.className = classes[accessLevel];
    }
    // Hide settings and employees tabs unless owner
    const settingsTab = document.querySelector('[data-tab="settings"]');
    const employeesTab = document.querySelector('[data-tab="employees"]');
    if (settingsTab) settingsTab.style.display = accessLevel === 'owner' ? '' : 'none';
    if (employeesTab) employeesTab.style.display = accessLevel === 'owner' ? '' : 'none';
    // If on a restricted tab, switch to dashboard
    if (accessLevel !== 'owner' && (currentTab === 'settings' || currentTab === 'employees')) {
      switchTab('dashboard');
    }
  }

  async function checkPasscodeExists() {
    try {
      const res = await fetch(FIREBASE_URL + '/passcode.json');
      const data = await res.json();
      return !!data;
    } catch { return false; }
  }

  function showUnlockModal() {
    showModal(`
      <h3>🔒 Enter Passcode</h3>
      <p style="color:#a0a0a0;font-size:13px;margin-bottom:12px;">Enter your owner or employee passcode.</p>
      <div class="control-group mb-8">
        <input id="unlockCode" type="password" placeholder="Enter passcode" style="flex:1;" />
      </div>
      <div id="unlockError" style="color:#f87171;font-size:13px;margin-bottom:8px;"></div>
      <div class="modal-actions">
        <button class="btn" id="unlockCancel">Cancel</button>
        <button class="btn primary" id="unlockSubmit">Unlock</button>
      </div>
    `);
    $('unlockCode').focus();
    $('unlockCancel').onclick = hideModal;
    $('unlockCode').onkeydown = (e) => { if (e.key === 'Enter') $('unlockSubmit').click(); };
    $('unlockSubmit').onclick = async () => {
      const code = $('unlockCode').value;
      if (!code) return;
      const hash = await hashPasscode(code);
      try {
        const [ownerRes, empRes] = await Promise.all([
          fetch(FIREBASE_URL + '/passcode.json'),
          fetch(FIREBASE_URL + '/employeePasscode.json')
        ]);
        const ownerHash = await ownerRes.json();
        const empHash = await empRes.json();
        if (ownerHash && hash === ownerHash) {
          accessLevel = 'owner';
          sessionStorage.setItem('saa_access', 'owner');
          hideModal();
          applyLockState();
          render();
        } else if (empHash && hash === empHash) {
          accessLevel = 'employee';
          sessionStorage.setItem('saa_access', 'employee');
          hideModal();
          applyLockState();
          render();
        } else {
          $('unlockError').textContent = 'Incorrect passcode.';
        }
      } catch {
        $('unlockError').textContent = 'Could not verify. Check connection.';
      }
    };
  }

  function showSetPasscodeModal() {
    showModal(`
      <h3>🔑 Set Owner Passcode</h3>
      <p style="color:#a0a0a0;font-size:13px;margin-bottom:12px;">No passcode set yet. Create one to protect editing access.</p>
      <div class="control-group mb-8">
        <input id="newPasscode" type="password" placeholder="New passcode" style="flex:1;" />
      </div>
      <div class="control-group mb-8">
        <input id="confirmPasscode" type="password" placeholder="Confirm passcode" style="flex:1;" />
      </div>
      <div id="setPassError" style="color:#f87171;font-size:13px;margin-bottom:8px;"></div>
      <div class="modal-actions">
        <button class="btn" id="setPassCancel">Cancel</button>
        <button class="btn primary" id="setPassSubmit">Set Passcode</button>
      </div>
    `);
    $('newPasscode').focus();
    $('setPassCancel').onclick = hideModal;
    $('confirmPasscode').onkeydown = (e) => { if (e.key === 'Enter') $('setPassSubmit').click(); };
    $('setPassSubmit').onclick = async () => {
      const code = $('newPasscode').value;
      const confirm = $('confirmPasscode').value;
      if (!code) { $('setPassError').textContent = 'Enter a passcode.'; return; }
      if (code !== confirm) { $('setPassError').textContent = 'Passcodes do not match.'; return; }
      try {
        const hash = await hashPasscode(code);
        const res = await fetch(FIREBASE_URL + '/passcode.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hash)
        });
        if (!res.ok) throw new Error();
        accessLevel = 'owner';
        sessionStorage.setItem('saa_access', 'owner');
        hideModal();
        applyLockState();
        render();
      } catch {
        $('setPassError').textContent = 'Failed to save. Check connection.';
      }
    };
  }

  function showChangePasscodeModal() {
    showModal(`
      <h3>🔑 Change Owner Passcode</h3>
      <div class="control-group mb-8">
        <input id="oldPasscode" type="password" placeholder="Current owner passcode" style="flex:1;" />
      </div>
      <div class="control-group mb-8">
        <input id="newPasscode2" type="password" placeholder="New passcode" style="flex:1;" />
      </div>
      <div class="control-group mb-8">
        <input id="confirmPasscode2" type="password" placeholder="Confirm new passcode" style="flex:1;" />
      </div>
      <div id="changePassError" style="color:#f87171;font-size:13px;margin-bottom:8px;"></div>
      <div class="modal-actions">
        <button class="btn" id="changePassCancel">Cancel</button>
        <button class="btn primary" id="changePassSubmit">Change</button>
      </div>
    `);
    $('oldPasscode').focus();
    $('changePassCancel').onclick = hideModal;
    $('confirmPasscode2').onkeydown = (e) => { if (e.key === 'Enter') $('changePassSubmit').click(); };
    $('changePassSubmit').onclick = async () => {
      const old = $('oldPasscode').value;
      const code = $('newPasscode2').value;
      const confirm = $('confirmPasscode2').value;
      if (!old || !code) { $('changePassError').textContent = 'Fill in all fields.'; return; }
      if (code !== confirm) { $('changePassError').textContent = 'New passcodes do not match.'; return; }
      try {
        const oldHash = await hashPasscode(old);
        const res = await fetch(FIREBASE_URL + '/passcode.json');
        const stored = await res.json();
        if (stored !== oldHash) { $('changePassError').textContent = 'Current passcode is incorrect.'; return; }
        const newHash = await hashPasscode(code);
        await fetch(FIREBASE_URL + '/passcode.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newHash)
        });
        hideModal();
      } catch {
        $('changePassError').textContent = 'Failed to update. Check connection.';
      }
    };
  }

  function showEmployeePasscodeModal() {
    showModal(`
      <h3>🔑 Set Employee Passcode</h3>
      <p style="color:#a0a0a0;font-size:13px;margin-bottom:12px;">Employees can use this to log services. They won't have access to settings or employee management.</p>
      <div class="control-group mb-8">
        <input id="empPasscode" type="password" placeholder="Employee passcode" style="flex:1;" />
      </div>
      <div class="control-group mb-8">
        <input id="empPasscodeConfirm" type="password" placeholder="Confirm passcode" style="flex:1;" />
      </div>
      <div id="empPassError" style="color:#f87171;font-size:13px;margin-bottom:8px;"></div>
      <div class="modal-actions">
        <button class="btn" id="empPassCancel">Cancel</button>
        <button class="btn primary" id="empPassSubmit">Save</button>
      </div>
    `);
    $('empPasscode').focus();
    $('empPassCancel').onclick = hideModal;
    $('empPasscodeConfirm').onkeydown = (e) => { if (e.key === 'Enter') $('empPassSubmit').click(); };
    $('empPassSubmit').onclick = async () => {
      const code = $('empPasscode').value;
      const confirm = $('empPasscodeConfirm').value;
      if (!code) { $('empPassError').textContent = 'Enter a passcode.'; return; }
      if (code !== confirm) { $('empPassError').textContent = 'Passcodes do not match.'; return; }
      try {
        const hash = await hashPasscode(code);
        const res = await fetch(FIREBASE_URL + '/employeePasscode.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hash)
        });
        if (!res.ok) throw new Error();
        hideModal();
      } catch {
        $('empPassError').textContent = 'Failed to save. Check connection.';
      }
    };
  }

  function getRole(roleId) {
    return state.roles.find(r => r.id === roleId);
  }

  function getService(serviceId) {
    return state.services.find(s => s.id === serviceId);
  }

  function getServicePrice(serviceId) {
    const svc = getService(serviceId);
    if (!svc) return 0;
    return state.eventMode ? (svc.eventPrice ?? svc.price) : svc.price;
  }

  function getEmployeeWork(empId) {
    if (!state.work[empId]) {
      state.work[empId] = { inventory: {}, entries: [] };
    }
    const w = state.work[empId];
    if (!w.inventory || typeof w.inventory !== 'object') w.inventory = {};
    if (!Array.isArray(w.entries)) w.entries = [];
    return w;
  }

  function calcEmployeeSales(empId) {
    const work = getEmployeeWork(empId);
    let total = 0;

    // Inventory items
    for (const [svcId, qty] of Object.entries(work.inventory)) {
      total += getServicePrice(svcId) * qty;
    }

    // Service entries
    for (const entry of work.entries) {
      total += getServicePrice(entry.serviceId);
    }

    return total;
  }

  function calcEmployeeCommission(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return 0;
    const role = getRole(emp.roleId);
    const rate = role ? role.commission / 100 : 0;
    return calcEmployeeSales(empId) * rate;
  }

  function calcEmployeeServiceCount(empId) {
    const work = getEmployeeWork(empId);
    let count = 0;
    for (const qty of Object.values(work.inventory)) count += qty;
    count += work.entries.length;
    return count;
  }

  function calcGovTotal(empId) {
    const work = getEmployeeWork(empId);
    let count = 0;
    for (const entry of work.entries) {
      if (entry.serviceId === 'gov_internals') count++;
    }
    return count;
  }

  function calcHgGovTotal(empId) {
    const work = getEmployeeWork(empId);
    let count = 0;
    for (const entry of work.entries) {
      if (entry.serviceId === 'gov_hg_internals') count++;
    }
    return count;
  }

  // === TAB SWITCHING ===
  let currentTab = 'dashboard';

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const tabEl = $(tab + 'Tab');
    if (tabEl) tabEl.classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    render();
  }

  // === RENDER ===
  let fromRemote = false;

  function render() {
    switch (currentTab) {
      case 'dashboard': renderDashboard(); break;
      case 'commissions': renderCommissions(); break;
      case 'employees': renderEmployees(); break;
      case 'settings': renderSettings(); break;
    }
    if (!fromRemote) saveState();
  }

  // --- DASHBOARD ---
  function renderDashboard() {
    const activeEmps = state.employees.filter(e => e.active);

    let totalSales = 0;
    let totalCommissions = 0;
    let govTotal = 0;
    let hgGovTotal = 0;

    for (const emp of activeEmps) {
      totalSales += calcEmployeeSales(emp.id);
      totalCommissions += calcEmployeeCommission(emp.id);
      govTotal += calcGovTotal(emp.id);
      hgGovTotal += calcHgGovTotal(emp.id);
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
      <div class="metric-card">
        <div class="metric-label">Active Employees</div>
        <div class="metric-value">${activeEmps.length}</div>
        <div class="metric-accent" style="background:#a78bfa;"></div>
      </div>
    `;

    // Employee table
    const tbody = $('dashboardBody');
    tbody.innerHTML = '';

    // Sort: active first, then by gross sales desc
    const sorted = [...state.employees].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return calcEmployeeSales(b.id) - calcEmployeeSales(a.id);
    });

    for (const emp of sorted) {
      const role = getRole(emp.roleId);
      const sales = calcEmployeeSales(emp.id);
      const comm = calcEmployeeCommission(emp.id);
      const net = sales - comm;
      const svcCount = calcEmployeeServiceCount(emp.id);

      const tr = document.createElement('tr');
      if (!emp.active) tr.style.opacity = '0.4';
      tr.innerHTML = `
        <td style="font-weight:600;">${esc(emp.name)}</td>
        <td><span class="role-badge" style="background:${role ? role.color : '#666'}22;color:${role ? role.color : '#888'};border-color:${role ? role.color : '#666'};">${esc(role ? role.name : 'Unknown')}</span></td>
        <td class="muted">${esc(emp.stateId)}</td>
        <td>${svcCount}</td>
        <td class="text-green">${money(sales)}</td>
        <td>${role ? role.commission + '%' : '-'}</td>
        <td class="text-amber">${money(comm)}</td>
        <td class="text-blue">${money(net)}</td>
        <td><span class="badge ${emp.active ? 'active' : 'inactive'}">${emp.active ? 'Active' : 'Inactive'}</span></td>
      `;
      tbody.appendChild(tr);
    }

    // Transaction totals
    $('transactionTotals').innerHTML = `
      <div class="stat-row"><span class="stat-label">Sales</span><span class="stat-value text-green">${money(totalSales)}</span></div>
      <div class="stat-row"><span class="stat-label">Commissions</span><span class="stat-value text-amber">${money(totalCommissions)}</span></div>
      <div class="stat-row"><span class="stat-label">Net Revenue</span><span class="stat-value text-blue">${money(netRevenue)}</span></div>
    `;

    // Gov totals
    $('govTotals').innerHTML = `
      <div class="stat-row"><span class="stat-label">Gov Total</span><span class="stat-value">${govTotal}</span></div>
      <div class="stat-row"><span class="stat-label">HG Gov Total</span><span class="stat-value">${hgGovTotal}</span></div>
    `;
  }

  // --- COMMISSIONS ---
  function renderCommissions() {
    const activeEmps = state.employees.filter(e => e.active);
    const picker = $('employeePicker');
    picker.innerHTML = '';

    for (const emp of activeEmps) {
      const role = getRole(emp.roleId);
      const sales = calcEmployeeSales(emp.id);
      const pill = document.createElement('button');
      pill.className = 'emp-pill' + (state.selectedEmployeeId === emp.id ? ' selected' : '');
      pill.innerHTML = `
        <span class="emp-pill-dot" style="background:${role ? role.color : '#666'};"></span>
        ${esc(emp.name)}
        <span class="emp-pill-sales">${money(sales)}</span>
      `;
      pill.onclick = () => {
        state.selectedEmployeeId = emp.id;
        renderCommissions();
      };
      picker.appendChild(pill);
    }

    if (!state.selectedEmployeeId || !activeEmps.find(e => e.id === state.selectedEmployeeId)) {
      $('commissionWorkArea').style.display = 'none';
      $('noEmployeeSelected').style.display = '';
      return;
    }

    $('commissionWorkArea').style.display = '';
    $('noEmployeeSelected').style.display = 'none';

    const emp = state.employees.find(e => e.id === state.selectedEmployeeId);
    const role = getRole(emp.roleId);
    const work = getEmployeeWork(emp.id);

    $('workEmployeeName').textContent = emp.name + (role ? ` (${role.name})` : '');

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
          <button class="counter-btn minus" data-svc="${svc.id}" data-dir="-1">&minus;</button>
          <span class="counter-value${qty > 0 ? ' has-value' : ''}">${qty}</span>
          <button class="counter-btn plus" data-svc="${svc.id}" data-dir="1">+</button>
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
      renderCommissions();
      saveState();
    };

    // Service buttons
    const logServices = state.services.filter(s => s.category === 'service');
    const svcBtnsEl = $('serviceButtons');
    svcBtnsEl.innerHTML = '';

    // Color mapping by price tier
    const getServiceColor = (price) => {
      if (price === 0) return '#6b7280';
      if (price <= 100) return '#16a34a';
      if (price <= 1000) return '#2563eb';
      if (price <= 5000) return '#7c3aed';
      return '#dc2626';
    };

    for (const svc of logServices) {
      const price = getServicePrice(svc.id);
      const color = getServiceColor(svc.price);
      const btn = document.createElement('button');
      btn.className = 'service-btn';
      btn.style.borderColor = color;
      btn.style.backgroundColor = color + '22';
      btn.innerHTML = `<span class="svc-name">${esc(svc.name)}</span><span class="svc-price">${money(price)}</span>`;
      btn.onclick = () => {
        const w = getEmployeeWork(state.selectedEmployeeId);
        w.entries.push({ id: uid(), serviceId: svc.id, timestamp: Date.now() });
        renderCommissions();
        saveState();
      };
      svcBtnsEl.appendChild(btn);
    }

    // Summary
    const sales = calcEmployeeSales(emp.id);
    const commAmt = calcEmployeeCommission(emp.id);
    const net = sales - commAmt;
    const commRate = role ? role.commission : 0;

    $('employeeSummary').innerHTML = `
      <div class="summary-card"><div class="sc-label">Gross Sales</div><div class="sc-value text-green">${money(sales)}</div></div>
      <div class="summary-card"><div class="sc-label">Commission Rate</div><div class="sc-value text-amber">${commRate}%</div></div>
      <div class="summary-card"><div class="sc-label">Commission</div><div class="sc-value text-amber">${money(commAmt)}</div></div>
      <div class="summary-card"><div class="sc-label">Net Sales</div><div class="sc-value text-blue">${money(net)}</div></div>
    `;

    // Service log
    const logEl = $('serviceLog');
    logEl.innerHTML = '';

    // Combine inventory + entries for display
    const logItems = [];

    // Inventory as log items
    for (const [svcId, qty] of Object.entries(work.inventory)) {
      if (qty > 0) {
        const svc = getService(svcId);
        if (svc) {
          logItems.push({
            type: 'inventory',
            name: `${svc.name} x${qty}`,
            total: getServicePrice(svcId) * qty,
            svcId
          });
        }
      }
    }

    // Service entries (newest first)
    const sortedEntries = [...work.entries].sort((a, b) => b.timestamp - a.timestamp);
    for (const entry of sortedEntries) {
      const svc = getService(entry.serviceId);
      if (svc) {
        logItems.push({
          type: 'entry',
          name: svc.name,
          total: getServicePrice(entry.serviceId),
          entryId: entry.id
        });
      }
    }

    if (logItems.length === 0) {
      logEl.innerHTML = '<div class="log-empty">No services logged yet</div>';
    } else {
      for (const item of logItems) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `
          <span class="log-name">${esc(item.name)}</span>
          <span class="log-price">${money(item.total)}</span>
          ${item.type === 'entry' ? `<button class="log-delete" data-entry-id="${item.entryId}" title="Remove">&times;</button>` : ''}
        `;
        logEl.appendChild(div);
      }

      logEl.onclick = (e) => {
        const del = e.target.closest('.log-delete');
        if (!del) return;
        const entryId = del.dataset.entryId;
        const w = getEmployeeWork(state.selectedEmployeeId);
        w.entries = w.entries.filter(en => en.id !== entryId);
        renderCommissions();
        saveState();
      };
    }
  }

  // --- EMPLOYEES ---
  function renderEmployees() {
    // Populate role dropdown
    const roleSelect = $('newEmpRole');
    if (roleSelect.children.length !== state.roles.length) {
      roleSelect.innerHTML = '';
      for (const role of state.roles) {
        const opt = document.createElement('option');
        opt.value = role.id;
        opt.textContent = role.name;
        roleSelect.appendChild(opt);
      }
    }

    const grid = $('employeeGrid');
    grid.innerHTML = '';

    let filtered = state.employees;
    if (state.employeeFilter === 'active') filtered = filtered.filter(e => e.active);
    else if (state.employeeFilter === 'inactive') filtered = filtered.filter(e => !e.active);

    // Sort: by role order then name
    const roleOrder = {};
    state.roles.forEach((r, i) => roleOrder[r.id] = i);
    filtered.sort((a, b) => (roleOrder[a.roleId] ?? 99) - (roleOrder[b.roleId] ?? 99) || a.name.localeCompare(b.name));

    for (const emp of filtered) {
      const role = getRole(emp.roleId);
      const sales = calcEmployeeSales(emp.id);
      const comm = calcEmployeeCommission(emp.id);
      const net = sales - comm;

      const card = document.createElement('div');
      card.className = 'employee-card' + (emp.active ? '' : ' inactive');
      card.style.borderLeftColor = role ? role.color : '#666';
      card.innerHTML = `
        <div class="ec-header">
          <div>
            <div class="ec-name">${esc(emp.name)}</div>
            <div class="ec-state-id">ID: ${esc(emp.stateId)}</div>
          </div>
          <label class="toggle-switch" title="${emp.active ? 'Deactivate' : 'Activate'}">
            <input type="checkbox" ${emp.active ? 'checked' : ''} data-emp-toggle="${emp.id}" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="ec-role">
          <span class="role-badge" style="background:${role ? role.color : '#666'}22;color:${role ? role.color : '#888'};border-color:${role ? role.color : '#666'};">
            ${esc(role ? role.name : 'Unknown')}${role ? ` (${role.commission}%)` : ''}
          </span>
        </div>
        <div class="ec-stats">
          <div><div class="ec-stat-label">Gross Sales</div><div class="ec-stat-value text-green">${money(sales)}</div></div>
          <div><div class="ec-stat-label">Commission</div><div class="ec-stat-value text-amber">${money(comm)}</div></div>
          <div><div class="ec-stat-label">Net Sales</div><div class="ec-stat-value text-blue">${money(net)}</div></div>
          <div><div class="ec-stat-label">Services</div><div class="ec-stat-value">${calcEmployeeServiceCount(emp.id)}</div></div>
        </div>
        <div class="ec-actions">
          <button class="btn small" data-emp-edit="${emp.id}">Edit</button>
          <button class="btn small danger" data-emp-delete="${emp.id}">Remove</button>
        </div>
      `;
      grid.appendChild(card);
    }

    // Event delegation for cards
    grid.onclick = (e) => {
      const editBtn = e.target.closest('[data-emp-edit]');
      const deleteBtn = e.target.closest('[data-emp-delete]');

      if (editBtn) {
        showEditEmployeeModal(editBtn.dataset.empEdit);
      } else if (deleteBtn) {
        showConfirmModal('Remove this employee? Their data will be lost.', () => {
          state.employees = state.employees.filter(em => em.id !== deleteBtn.dataset.empDelete);
          delete state.work[deleteBtn.dataset.empDelete];
          render();
        });
      }
    };

    grid.onchange = (e) => {
      const toggle = e.target.closest('[data-emp-toggle]');
      if (toggle) {
        const emp = state.employees.find(em => em.id === toggle.dataset.empToggle);
        if (emp) {
          emp.active = toggle.checked;
          render();
        }
      }
    };
  }

  // --- SETTINGS ---
  function renderSettings() {
    // Roles
    const rolesEl = $('rolesEditor');
    rolesEl.innerHTML = '';
    for (const role of state.roles) {
      const div = document.createElement('div');
      div.className = 'role-row';
      div.innerHTML = `
        <input class="role-color-input" type="color" value="${role.color}" data-role-color="${role.id}" />
        <input class="role-name-input" value="${esc(role.name)}" data-role-name="${role.id}" placeholder="Name" />
        <input class="role-pct-input" type="number" value="${role.commission}" data-role-pct="${role.id}" placeholder="%" min="0" max="100" />
        <span style="color:#a0a0a0;font-size:12px;">%</span>
        <button class="role-delete" data-role-delete="${role.id}" title="Remove">&times;</button>
      `;
      rolesEl.appendChild(div);
    }

    rolesEl.onchange = (e) => {
      const nameInput = e.target.closest('[data-role-name]');
      const pctInput = e.target.closest('[data-role-pct]');
      const colorInput = e.target.closest('[data-role-color]');

      if (nameInput) {
        const role = state.roles.find(r => r.id === nameInput.dataset.roleName);
        if (role) { role.name = nameInput.value; saveState(); }
      }
      if (pctInput) {
        const role = state.roles.find(r => r.id === pctInput.dataset.rolePct);
        if (role) { role.commission = Math.max(0, Math.min(100, parseFloat(pctInput.value) || 0)); saveState(); }
      }
      if (colorInput) {
        const role = state.roles.find(r => r.id === colorInput.dataset.roleColor);
        if (role) { role.color = colorInput.value; saveState(); }
      }
    };

    rolesEl.onclick = (e) => {
      const del = e.target.closest('[data-role-delete]');
      if (del) {
        state.roles = state.roles.filter(r => r.id !== del.dataset.roleDelete);
        render();
      }
    };

    // Services
    const svcEl = $('servicesEditor');
    svcEl.innerHTML = '';
    for (const svc of state.services) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input value="${esc(svc.name)}" data-svc-name="${svc.id}" style="width:100%;padding:6px 8px;font-size:13px;" /></td>
        <td><input type="number" value="${svc.price}" data-svc-price="${svc.id}" style="width:90px;padding:6px 8px;font-size:13px;" min="0" /></td>
        <td><input type="number" value="${svc.eventPrice ?? svc.price}" data-svc-event="${svc.id}" style="width:90px;padding:6px 8px;font-size:13px;" min="0" /></td>
        <td>
          <select data-svc-cat="${svc.id}" style="padding:6px;font-size:12px;">
            <option value="inventory" ${svc.category === 'inventory' ? 'selected' : ''}>Inventory</option>
            <option value="service" ${svc.category === 'service' ? 'selected' : ''}>Service</option>
          </select>
        </td>
        <td><button class="role-delete" data-svc-delete="${svc.id}" title="Remove">&times;</button></td>
      `;
      svcEl.appendChild(tr);
    }

    svcEl.onchange = (e) => {
      const nameIn = e.target.closest('[data-svc-name]');
      const priceIn = e.target.closest('[data-svc-price]');
      const eventIn = e.target.closest('[data-svc-event]');
      const catIn = e.target.closest('[data-svc-cat]');

      if (nameIn) { const s = getService(nameIn.dataset.svcName); if (s) s.name = nameIn.value; }
      if (priceIn) { const s = getService(priceIn.dataset.svcPrice); if (s) s.price = Math.max(0, parseFloat(priceIn.value) || 0); }
      if (eventIn) { const s = getService(eventIn.dataset.svcEvent); if (s) s.eventPrice = Math.max(0, parseFloat(eventIn.value) || 0); }
      if (catIn) { const s = getService(catIn.dataset.svcCat); if (s) s.category = catIn.value; }
      saveState();
    };

    svcEl.onclick = (e) => {
      const del = e.target.closest('[data-svc-delete]');
      if (del) {
        state.services = state.services.filter(s => s.id !== del.dataset.svcDelete);
        render();
      }
    };

    // Gold pricing
    const goldEl = $('goldPricingEditor');
    goldEl.innerHTML = '';
    for (const tier of state.goldPricing) {
      const div = document.createElement('div');
      div.className = 'gold-row';
      const rangeText = tier.max === Infinity ? `${tier.min}+` : `${tier.min} - ${tier.max}`;
      div.innerHTML = `
        <span class="gold-range">${rangeText}</span>
        <span class="gold-price">${money(tier.price)} per</span>
      `;
      goldEl.appendChild(div);
    }
  }

  // === HTML ESCAPING ===
  const escDiv = document.createElement('div');
  function esc(text) {
    escDiv.textContent = text;
    return escDiv.innerHTML;
  }

  // === MODALS ===
  function showModal(html) {
    $('modalContent').innerHTML = html;
    $('modalOverlay').style.display = '';
  }

  function hideModal() {
    $('modalOverlay').style.display = 'none';
  }

  function showConfirmModal(message, onConfirm) {
    showModal(`
      <h3>Confirm</h3>
      <p style="color:#a0a0a0;">${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn" id="modalCancel">Cancel</button>
        <button class="btn danger" id="modalConfirm">Confirm</button>
      </div>
    `);
    $('modalCancel').onclick = hideModal;
    $('modalConfirm').onclick = () => { hideModal(); onConfirm(); };
  }

  function showEditEmployeeModal(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    let roleOptions = state.roles.map(r =>
      `<option value="${r.id}" ${emp.roleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`
    ).join('');

    showModal(`
      <h3>Edit Employee</h3>
      <div class="control-group mb-8">
        <label>Name</label>
        <input id="editEmpName" value="${esc(emp.name)}" style="flex:1;" />
      </div>
      <div class="control-group mb-8">
        <label>State ID</label>
        <input id="editEmpStateId" value="${esc(emp.stateId)}" style="flex:1;" />
      </div>
      <div class="control-group mb-8">
        <label>Role</label>
        <select id="editEmpRole" style="flex:1;">${roleOptions}</select>
      </div>
      <div class="modal-actions">
        <button class="btn" id="editEmpCancel">Cancel</button>
        <button class="btn primary" id="editEmpSave">Save</button>
      </div>
    `);

    $('editEmpCancel').onclick = hideModal;
    $('editEmpSave').onclick = () => {
      const name = $('editEmpName').value.trim();
      const stateId = $('editEmpStateId').value.trim();
      const roleId = $('editEmpRole').value;
      if (!name) return;
      emp.name = name;
      emp.stateId = stateId;
      emp.roleId = roleId;
      hideModal();
      render();
    };
  }

  // === FIREBASE DATABASE ===
  let syncTimer = null;
  let syncInFlight = false;
  let initialLoadDone = false;
  let ignoreNextStream = false;

  function scheduleSync() {
    if (!initialLoadDone) return; // Don't push until we've loaded from Firebase
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushToFirebase(), 1500);
  }

  function updateSyncBadge(text, ok) {
    const el = $('syncStatus');
    el.textContent = text;
    el.className = 'sync-status' + (ok ? ' connected' : '');
  }

  // Keys that are local UI state, not shared data
  const LOCAL_KEYS = new Set(['selectedEmployeeId', 'employeeFilter']);

  async function loadFromFirebase() {
    try {
      updateSyncBadge('Loading...', false);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(FIREBASE_URL + '/state.json', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      if (data) {
        // Merge remote data into state, preserve local UI state
        Object.keys(data).forEach(k => {
          if (!LOCAL_KEYS.has(k)) state[k] = data[k];
        });
        // Re-hydrate Infinity for gold pricing
        if (state.goldPricing) {
          for (const tier of state.goldPricing) {
            if (tier.max === null || tier.max === 'Infinity') tier.max = Infinity;
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
      updateSyncBadge('Synced', true);
      if ($('firebaseStatus')) {
        $('firebaseStatus').textContent = 'Connected to Firebase.';
        $('firebaseStatus').style.color = '#4ade80';
      }
      return true;
    } catch (err) {
      updateSyncBadge('Offline', false);
      if ($('firebaseStatus')) {
        $('firebaseStatus').textContent = 'Could not reach Firebase: ' + err.message + '. Using local data.';
        $('firebaseStatus').style.color = '#f87171';
      }
      return false;
    }
  }

  async function pushToFirebase() {
    if (syncInFlight || !initialLoadDone) return;
    syncInFlight = true;
    ignoreNextStream = true; // Don't re-apply our own push
    try {
      updateSyncBadge('Saving...', false);
      // Strip local-only keys before pushing
      const shared = {};
      for (const [k, v] of Object.entries(state)) {
        if (!LOCAL_KEYS.has(k)) shared[k] = v;
      }
      const payload = JSON.parse(JSON.stringify(shared, (key, val) => val === Infinity ? 'Infinity' : val));

      const res = await fetch(FIREBASE_URL + '/state.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);
      updateSyncBadge('Synced', true);
    } catch (err) {
      updateSyncBadge('Sync Error', false);
    } finally {
      syncInFlight = false;
    }
  }

  // === REAL-TIME STREAMING (SSE) ===
  let eventSource = null;

  function startStreaming() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(FIREBASE_URL + '/state.json');

    function applyRemoteData(data) {
      // Only merge shared keys, preserve local UI state
      Object.keys(data).forEach(k => {
        if (!LOCAL_KEYS.has(k)) state[k] = data[k];
      });
      if (state.goldPricing) {
        for (const tier of state.goldPricing) {
          if (tier.max === null || tier.max === 'Infinity') tier.max = Infinity;
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      fromRemote = true;
      render();
      fromRemote = false;
      updateSyncBadge('Synced', true);
    }

    eventSource.addEventListener('put', (e) => {
      if (ignoreNextStream) { ignoreNextStream = false; return; }
      try {
        const msg = JSON.parse(e.data);
        if (msg.path === '/' && msg.data) applyRemoteData(msg.data);
      } catch { /* ignore parse errors */ }
    });

    eventSource.addEventListener('patch', (e) => {
      if (ignoreNextStream) { ignoreNextStream = false; return; }
      try {
        const msg = JSON.parse(e.data);
        if (msg.data) applyRemoteData(msg.data);
      } catch { /* ignore parse errors */ }
    });

    eventSource.onerror = () => {
      updateSyncBadge('Reconnecting...', false);
      // EventSource auto-reconnects
    };
  }

  // === CSV EXPORT ===
  function exportCsv() {
    const rows = [['Employee', 'Role', 'State ID', 'Gross Sales', 'Commission %', 'Commission $', 'Net Sales', 'Services', 'Status']];

    for (const emp of state.employees) {
      const role = getRole(emp.roleId);
      const sales = calcEmployeeSales(emp.id);
      const comm = calcEmployeeCommission(emp.id);
      rows.push([
        emp.name,
        role ? role.name : '',
        emp.stateId,
        sales,
        role ? role.commission : 0,
        comm.toFixed(2),
        (sales - comm).toFixed(2),
        calcEmployeeServiceCount(emp.id),
        emp.active ? 'Active' : 'Inactive'
      ]);
    }

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(csv, 'commissions.csv', 'text/csv');
  }

  // === JSON EXPORT/IMPORT ===
  function exportJson() {
    const json = JSON.stringify(state, null, 2);
    downloadFile(json, 'commission-data.json', 'application/json');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        // Validate basic structure
        if (!data.employees || !data.services || !data.roles) {
          alert('Invalid data file format.');
          return;
        }
        Object.assign(state, data);
        saveState();
        render();
      } catch {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // === EVENT HANDLERS ===
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
        active: true
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
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    };

    $('resetAllBtn').onclick = () => {
      showConfirmModal('Reset ALL data to defaults? This will clear both local and remote data. This cannot be undone.', async () => {
        try {
          await fetch(FIREBASE_URL + '/state.json', { method: 'DELETE' });
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
    $('lockToggle').onclick = async () => {
      if (accessLevel !== 'viewer') {
        accessLevel = 'viewer';
        sessionStorage.removeItem('saa_access');
        applyLockState();
        render();
      } else {
        const exists = await checkPasscodeExists();
        if (exists) {
          showUnlockModal();
        } else {
          showSetPasscodeModal();
        }
      }
    };

    // Change passcodes (owner settings)
    $('changePasscodeBtn').onclick = () => showChangePasscodeModal();
    $('changeEmpPasscodeBtn').onclick = () => showEmployeePasscodeModal();

    // Restore session access level
    const savedAccess = sessionStorage.getItem('saa_access');
    if (savedAccess === 'owner' || savedAccess === 'employee') {
      accessLevel = savedAccess;
    }
    applyLockState();

    // Startup: load from Firebase FIRST, then render
    // This prevents defaults from overwriting the shared database
    try {
      await loadFromFirebase();
    } catch { /* continue with local data */ }
    initialLoadDone = true;
    render();

    // Hide loading overlay
    const loader = $('loadingOverlay');
    if (loader) loader.style.display = 'none';

    // Start real-time streaming for concurrent updates
    startStreaming();
  }

  init().catch(err => {
    console.error('Init failed:', err);
    const loader = $('loadingOverlay');
    if (loader) loader.style.display = 'none';
  });
})();
