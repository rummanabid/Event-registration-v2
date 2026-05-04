let html5QrCode = null;
let currentEventId = null;
let sessionLog = [];
let debounceTimer = null;

function onEventChange(eventId) {
  currentEventId = eventId;
  stopScanner();

  if (eventId) {
    document.getElementById('scanner-placeholder').style.display = 'none';
    document.getElementById('scanner-buttons').style.display = 'flex';
    document.getElementById('manual-no-event').style.display = 'none';
    document.getElementById('manual-checkin-area').style.display = 'block';
    document.getElementById('checkin-counter').style.display = 'block';
    updateCounter();
  } else {
    document.getElementById('scanner-placeholder').style.display = 'flex';
    document.getElementById('scanner-buttons').style.display = 'none';
    document.getElementById('manual-no-event').style.display = 'block';
    document.getElementById('manual-checkin-area').style.display = 'none';
    document.getElementById('checkin-counter').style.display = 'none';
  }
}

async function startScanner() {
  if (!currentEventId) return;

  document.getElementById('start-btn').classList.add('hidden');
  document.getElementById('stop-btn').classList.remove('hidden');

  html5QrCode = new Html5Qrcode('qr-reader');

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 280 } },
      onQRScan,
      () => {}
    );
  } catch (err) {
    showFeedback('error', 'Camera access denied or unavailable.');
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('stop-btn').classList.add('hidden');
  }
}

async function stopScanner() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch (e) {}
    html5QrCode = null;
  }
  document.getElementById('start-btn').classList.remove('hidden');
  document.getElementById('stop-btn').classList.add('hidden');
}

async function onQRScan(decodedText) {
  // Extract token from URL if full URL was scanned
  let token = decodedText;
  const match = decodedText.match(/\/checkin\/([^/?#]+)/);
  if (match) token = match[1];

  await stopScanner();

  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
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
    // Auto-resume after 2.5s
    setTimeout(() => startScanner(), 2500);
  } catch (err) {
    showFeedback('error', '✗ Network error during check-in');
    setTimeout(() => startScanner(), 2500);
  }
}

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

function clearLog() {
  sessionLog = [];
  renderLog();
}

async function updateCounter() {
  if (!currentEventId) return;
  try {
    const res = await fetch(`/api/events/${currentEventId}/checkin-count`);
    const data = await res.json();
    document.getElementById('cnt-in').textContent = data.checkedIn;
    document.getElementById('cnt-total').textContent = data.total;
  } catch (e) {}
}

// Manual check-in
function debouncedSearch(q) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchRegistrations(q), 300);
}

async function searchRegistrations(q) {
  if (!currentEventId) return;
  const container = document.getElementById('manual-results');

  if (!q.trim()) {
    container.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`/api/events/${currentEventId}/search-registrations?q=${encodeURIComponent(q)}`);
    const regs = await res.json();
    renderManualResults(regs);
  } catch (e) {
    container.innerHTML = '<p class="text-sm text-muted">Error searching registrations.</p>';
  }
}

function renderManualResults(regs) {
  const container = document.getElementById('manual-results');
  if (regs.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted" style="text-align:center;padding:16px">No results found.</p>';
    return;
  }

  container.innerHTML = regs.map(r => `
    <div class="manual-reg-card ${r.checked_in ? 'checked-in' : ''}" id="manual-card-${r.id}">
      <div class="manual-reg-name">${escHtml(r.full_name)}</div>
      <div class="manual-reg-meta">
        ${escHtml(r.email)}
        ${r.company ? ' · ' + escHtml(r.company) : ''}
        ${r.phone ? ' · ' + escHtml(r.phone) : ''}
      </div>
      ${r.checked_in
        ? `<div class="manual-checked-in-label">✓ Checked in at ${new Date(r.checked_in_at).toLocaleTimeString()}</div>`
        : `<button class="btn btn-sm btn-success" onclick="manualCheckin('${r.id}', '${escHtml(r.full_name).replace(/'/g, "\\'")}')">✓ Confirm Attendance</button>`
      }
    </div>
  `).join('');
}

async function manualCheckin(regId, name) {
  const btn = document.querySelector(`#manual-card-${regId} button`);
  if (btn) { btn.disabled = true; btn.textContent = 'Checking in...'; }

  try {
    const res = await fetch(`/api/manual-checkin/${regId}`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'success') {
      showFeedback('success', `✓ Manually checked in: ${data.attendeeName}`);
      addLog('success', data.attendeeName, 'Manual');
      updateCounter();

      const card = document.getElementById(`manual-card-${regId}`);
      if (card) {
        card.classList.add('checked-in');
        card.querySelector('.btn')?.remove();
        const label = document.createElement('div');
        label.className = 'manual-checked-in-label';
        label.textContent = '✓ Checked in at ' + new Date().toLocaleTimeString();
        card.appendChild(label);
      }
    } else if (data.status === 'already_checked_in') {
      showFeedback('already', `⚡ Already checked in: ${data.attendeeName}`);
    }
  } catch (err) {
    showFeedback('error', '✗ Network error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirm Attendance'; }
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
