let html5QrCode = null;
let currentEventId = null;
let sessionLog = [];
let debounceTimer = null;
let counterInterval = null;
let listInterval = null;
let allAttendees = [];
let activeFilter = 'all';

function onEventChange(eventId) {
  currentEventId = eventId;
  stopScanner();
  clearInterval(counterInterval);
  clearInterval(listInterval);
  allAttendees = [];

  if (eventId) {
    document.getElementById('scanner-placeholder').style.display = 'none';
    document.getElementById('scanner-buttons').style.display = 'flex';
    document.getElementById('list-no-event').style.display = 'none';
    const area = document.getElementById('attendee-list-area');
    area.style.display = 'flex';
    document.getElementById('checkin-counter').style.display = 'block';
    updateCounter();
    loadAttendeeList();
    counterInterval = setInterval(updateCounter, 5000);
    listInterval = setInterval(loadAttendeeList, 5000);
  } else {
    document.getElementById('scanner-placeholder').style.display = 'flex';
    document.getElementById('scanner-buttons').style.display = 'none';
    document.getElementById('list-no-event').style.display = 'block';
    document.getElementById('attendee-list-area').style.display = 'none';
    document.getElementById('checkin-counter').style.display = 'none';
    document.getElementById('list-counter-badge').style.display = 'none';
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
      { fps: 10, qrbox: { width: 280, height: 280 } },
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
    const res = await fetch('/api/checkin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token }) });
    const data = await res.json();

    if (data.status === 'success') {
      showFeedback('success', `✓ Checked in: ${data.attendeeName}`);
      addLog('success', data.attendeeName, 'Checked In');
    } else if (data.status === 'already_checked_in') {
      showFeedback('already', `⚡ Already checked in: ${data.attendeeName}`);
      addLog('already', data.attendeeName, 'Duplicate');
    } else {
      showFeedback('error', '✗ Invalid or unknown QR code');
      addLog('error', 'Unknown', 'Invalid');
    }

    updateCounter();
    loadAttendeeList();
    setTimeout(() => startScanner(), 2500);
  } catch {
    showFeedback('error', '✗ Network error during check-in');
    setTimeout(() => startScanner(), 2500);
  }
}

// ---- Feedback & Log ----
function showFeedback(type, message) {
  const el = document.getElementById('scan-feedback');
  el.className = `scan-feedback ${type === 'success' ? 'success' : type === 'already' ? 'already' : 'error'}`;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function addLog(type, name, status) {
  sessionLog.unshift({ type, name, status, time: new Date() });
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

function clearLog() { sessionLog = []; renderLog(); }

async function updateCounter() {
  if (!currentEventId) return;
  try {
    const res = await fetch(`/api/events/${currentEventId}/checkin-count`);
    const data = await res.json();
    document.getElementById('cnt-in').textContent = data.checkedIn;
    document.getElementById('cnt-total').textContent = data.total;
  } catch {}
}

// ---- Attendee List ----
async function loadAttendeeList() {
  if (!currentEventId) return;
  try {
    const res = await fetch(`/api/events/${currentEventId}/registrations`);
    allAttendees = await res.json();
    renderAttendeeList();
    updateListBadge();
  } catch {}
}

function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === f));
  renderAttendeeList();
}

function filterList() { renderAttendeeList(); }

function renderAttendeeList() {
  const q = (document.getElementById('attendee-search').value || '').toLowerCase();
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

  // Sort: not-checked-in first, then alphabetical within each group
  list.sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? 1 : -1;
    return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' });
  });

  const container = document.getElementById('attendee-list');
  if (list.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted" style="text-align:center;padding:24px 0">No attendees match.</p>';
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
        : `<button class="btn btn-sm btn-success attendee-checkin-btn" onclick="manualCheckin('${r.id}', '${escHtml(r.full_name).replace(/'/g,"\\'")}')">Check In</button>`
      }
    </div>
  `).join('');
}

function updateListBadge() {
  const confirmed = allAttendees.filter(r => !r.waitlisted);
  const checkedIn = confirmed.filter(r => r.checked_in).length;
  const badge = document.getElementById('list-counter-badge');
  badge.style.display = 'inline-block';
  badge.textContent = `${checkedIn} / ${confirmed.length} in`;
}

// ---- Manual Check-in ----
async function manualCheckin(regId, name) {
  const btn = document.querySelector(`#arow-${regId} button`);
  if (btn) { btn.disabled = true; btn.textContent = 'Checking in…'; }

  try {
    const res = await fetch(`/api/manual-checkin/${regId}`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success') {
      showFeedback('success', `✓ Checked in: ${data.attendeeName}`);
      addLog('success', data.attendeeName, 'Manual');
      // Optimistically update local state then refresh
      const att = allAttendees.find(r => r.id === regId);
      if (att) { att.checked_in = 1; att.checked_in_at = new Date().toISOString(); }
      renderAttendeeList();
      updateListBadge();
      updateCounter();
    } else if (data.status === 'already_checked_in') {
      showFeedback('already', `⚡ Already checked in: ${data.attendeeName}`);
      loadAttendeeList();
    }
  } catch {
    showFeedback('error', '✗ Network error');
    if (btn) { btn.disabled = false; btn.textContent = 'Check In'; }
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
