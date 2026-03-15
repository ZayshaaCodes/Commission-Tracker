import { $, hashPasscode } from './utils.js';
import { FIREBASE_URL } from './firebase.js';
import { showModal, hideModal } from './modals.js';

// === ACCESS CONTROL ===
let accessLevel = 'viewer';

export function isUnlocked() { return accessLevel !== 'viewer'; }
export function isOwner() { return accessLevel === 'owner'; }
export function getAccessLevel() { return accessLevel; }

export function lockOut() {
  accessLevel = 'viewer';
  sessionStorage.removeItem('saa_access');
}

export function restoreSession() {
  const saved = sessionStorage.getItem('saa_access');
  if (saved === 'owner' || saved === 'employee') {
    accessLevel = saved;
  }
}

// === PASSCODE CHECKS ===
export async function checkPasscodeExists() {
  try {
    const res = await fetch(FIREBASE_URL + '/passcode.json');
    const data = await res.json();
    return !!data;
  } catch { return false; }
}

export function showUnlockModal(onSuccess) {
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
    const hash = hashPasscode(code);
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
        if (onSuccess) onSuccess();
      } else if (empHash && hash === empHash) {
        accessLevel = 'employee';
        sessionStorage.setItem('saa_access', 'employee');
        hideModal();
        if (onSuccess) onSuccess();
      } else {
        $('unlockError').textContent = 'Incorrect passcode.';
      }
    } catch {
      $('unlockError').textContent = 'Could not verify. Check connection.';
    }
  };
}

export function showSetPasscodeModal(onSuccess) {
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
      const hash = hashPasscode(code);
      const res = await fetch(FIREBASE_URL + '/passcode.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hash)
      });
      if (!res.ok) throw new Error();
      accessLevel = 'owner';
      sessionStorage.setItem('saa_access', 'owner');
      hideModal();
      if (onSuccess) onSuccess();
    } catch {
      $('setPassError').textContent = 'Failed to save. Check connection.';
    }
  };
}

export function showChangePasscodeModal() {
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
      const oldHash = hashPasscode(old);
      const res = await fetch(FIREBASE_URL + '/passcode.json');
      const stored = await res.json();
      if (stored !== oldHash) { $('changePassError').textContent = 'Current passcode is incorrect.'; return; }
      const newHash = hashPasscode(code);
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

export function showEmployeePasscodeModal() {
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
      const hash = hashPasscode(code);
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
