let html5QrCode = null;
let currentEventId = null;
let sessionLog = [];
let counterInterval = null;
let listInterval = null;
let allAttendees = [];
let activeFilter = 'all';
let activeTab = 'scanner';

// ---- Tab switching ----
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.scan-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.scan-tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (tab === 'list') { renderAttendeeList(); }
}

// ---- Event selection ----
function onEventChange(eventId) {
  currentEventId = eventId;
  stopScanner();
  clearInterval(counterInterval);
  clearInterval(listInterval);
  allAttendees = [];

  const tabBar = document.getElementById('scan-tab-bar');
  const noEvent = document.getElementById('list-no-event');
  const attendeeList = document.getElementById('attendee-list');

  if (eventId) {
    tabBar.style.display = 'flex';
    document.getElementById('scanner-placeholder').style.display = 'none';
    document.getElementById('scanner-buttons').style.display = 'flex';
    document.getElementById('scan-topbar-counter').style.display = 'flex';
    noEvent.style.display = 'none';
    attendeeList.style.display = 'block';
    updateCounter();
    loadAttendeeList();
    counterInterval = setInterval(updateCounter, 5000);
    listInterval   = setInterval(loadAttendeeList, 5000);
  } else {
    tabBar.style.display = 'none';
    document.getElementById('scanner-placeholder').style.display = 'flex';
    document.getElementById('scanner-buttons').style.display = 'none';
    document.getElementById('scan-topbar-counter').style.display = 'none';
    noEvent.style.display = 'block';
    attendeeList.style.display = 'none';
  }
}

// ---- QR Scanner ----
async function startScanner() {
  if (!currentEventId) return;
  document.getElementById('start-btn').classList.add('hidden');
  document.getElementById('stop-btn').classList.remove('hidden');

  html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      onQRScan, () => {}
    );
  } catch {
    showFeedback('error', 'Camera access denied or unavailable.');
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('stop-btn').classList.add('hidden');
  }
}

async function stopScanner() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch {}
    html5QrCode = null;
  }
  document.getElementById('start-btn').classList.remove('hidden');
  document.getElementById('stop-btn').classList.add('hidden');
}

async function onQRScan(decodedText) {
  let token = decodedText;
  const match = decodedText.match(/\/checkin\/([^/?#]+)/);
  if (match) token = match[1];

  await stopScanner();

  try {
    const res = await fetch('/api/checkin', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ token })
    });
    const data = await res.json();

    if (data.status === 'success') {
      showFeedback('success', `✓ ${data.attendeeName}`);
      addLog('success', data.attendeeName, 'Checked In');
    } else if (data.status === 'already_checked_in') {
      showFeedback('already', `Already in: ${data.attendeeName}`);
      addLog('already', data.attendeeName, 'Duplicate');
    } else {
      showFeedback('error', '✗ Invalid QR code');
      addLog('error', 'Unknown', 'Invalid');
    }

    updateCounter();
    loadAttendeeList();
    setTimeout(() => startScanner(), 2500);
  } catch {
    showFeedback('error', '✗ Network error');
    setTimeout(() => startScanner(), 2500);
  }
}

// ---- Feedback ----
function showFeedback(type, message) {
  const el = document.getElementById('scan-feedback');
  el.className = `scan-feedback ${type === 'success' ? 'success' : type === 'already' ? 'already' : 'error'}`;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ---- Session Log ----
function addLog(type, name, status) {
  sessionLog.unshift({ type, name, status, time: new Date() });
  // Show red dot on log tab
  const logTab = document.querySelector('[data-tab="log"]');
  if (logTab && activeTab !== 'log') logTab.classList.add('has-update');
  renderLog();
}

function renderLog() {
  const container = document.getElementById('session-log');
  if (sessionLog.length === 0) {
    container.innerHTML = '<div class="empty-state text-sm"><p>Scans will appear here.</p></div>';
    return;
  }
  container.innerHTML = sessionLog.map(item => `
    <div class="log-item log-${item.type}">
      <div>
        <div class="log-item-name">${escHtml(item.name)}</div>
        <div class="log-item-time">${item.time.toLocaleTimeString()}</div>
      </div>
      <span class="log-item-status">${escHtml(item.status)}</span>
    </div>
  `).join('');
}

function clearLog() {
  sessionLog = [];
  renderLog();
  document.querySelector('[data-tab="log"]')?.classList.remove('has-update');
}

// ---- Counter ----
async function updateCounter() {
  if (!currentEventId) return;
  try {
    const res = await fetch(`/api/events/${currentEventId}/checkin-count`);
    const d = await res.json();
    document.getElementById('cnt-in').textContent  = d.checkedIn;
    document.getElementById('cnt-total').textContent = d.total;
  } catch {}
}

// ---- Attendee List ----
async function loadAttendeeList() {
  if (!currentEventId) return;
  try {
    const res = await fetch(`/api/events/${currentEventId}/registrations`);
    allAttendees = await res.json();
    renderAttendeeList();
    updateTabCounts();
  } catch {}
}

function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === f));
  renderAttendeeList();
}

function filterList() { renderAttendeeList(); }

function renderAttendeeList() {
  const q = (document.getElementById('attendee-search')?.value || '').toLowerCase();
  let list = allAttendees.filter(r => !r.waitlisted);

  if (q) {
    list = list.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.phone || '').includes(q) ||
      (r.company || '').toLowerCase().includes(q)
    );
  }

  if (activeFilter === 'in')  list = list.filter(r => r.checked_in);
  if (activeFilter === 'out') list = list.filter(r => !r.checked_in);

  list.sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? 1 : -1;
    return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' });
  });

  const container = document.getElementById('attendee-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted" style="text-align:center;padding:32px 0">No attendees match.</p>';
    return;
  }

  container.innerHTML = list.map(r => `
    <div class="attendee-row ${r.checked_in ? 'attendee-in' : 'attendee-out'}" id="arow-${r.id}">
      <div class="attendee-row-info">
        <div class="attendee-row-name">${escHtml(r.full_name)}</div>
        <div class="attendee-row-meta">${escHtml(r.company || r.email)}</div>
      </div>
      ${r.checked_in
        ? `<span class="attendee-status-in">✓ In</span>`
        : `<button class="btn btn-sm btn-success attendee-checkin-btn" onclick="manualCheckin('${r.id}','${escHtml(r.full_name).replace(/'/g,"\\'")}')">Check In</button>`
      }
    </div>
  `).join('');
}

function updateTabCounts() {
  const confirmed = allAttendees.filter(r => !r.waitlisted);
  const inCount  = confirmed.filter(r => r.checked_in).length;
  const outCount = confirmed.length - inCount;

  document.getElementById('ft-all-count').textContent = confirmed.length;
  document.getElementById('ft-out-count').textContent = outCount;
  document.getElementById('ft-in-count').textContent  = inCount;

  // Top bar counter
  document.getElementById('cnt-in').textContent    = inCount;
  document.getElementById('cnt-total').textContent = confirmed.length;

  // Tab badge: show how many still need to arrive
  const badge = document.getElementById('tab-not-in-badge');
  if (outCount > 0) { badge.textContent = outCount; badge.style.display = 'inline-block'; }
  else { badge.style.display = 'none'; }
}

// ---- Manual Check-in ----
async function manualCheckin(regId, name) {
  const btn = document.querySelector(`#arow-${regId} button`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const res = await fetch(`/api/manual-checkin/${regId}`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success' || data.status === 'already_checked_in') {
      showFeedback('success', `✓ ${data.attendeeName}`);
      addLog('success', data.attendeeName, 'Manual');
      const att = allAttendees.find(r => r.id === regId);
      if (att) { att.checked_in = 1; att.checked_in_at = new Date().toISOString(); }
      renderAttendeeList();
      updateTabCounts();
    }
  } catch {
    showFeedback('error', '✗ Network error');
    if (btn) { btn.disabled = false; btn.textContent = 'Check In'; }
  }
}

// Remove log tab dot when user opens it
document.querySelectorAll('[data-tab="log"]').forEach(t =>
  t.addEventListener('click', () => t.classList.remove('has-update'))
);

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
