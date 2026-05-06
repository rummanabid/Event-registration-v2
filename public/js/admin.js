let currentEventId = null;
let allRegistrations = [];

// ---- Create Event ----
document.getElementById('create-event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creating...';

  const body = {
    name: form.name.value.trim(),
    date: form.date.value || null,
    time: form.time.value || null,
    end_time: form.end_time.value || null,
    location: form.location.value.trim() || null,
    maps_url: form.maps_url.value.trim() || null,
    capacity: form.capacity.value ? parseInt(form.capacity.value) : null
  };

  try {
    const res = await fetch('/api/events', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { window.location.reload(); }
    else { const d = await res.json(); alert(d.error || 'Failed to create event'); }
  } catch { alert('Network error'); }
  btn.disabled = false; btn.textContent = 'Create Event';
});

// ---- Edit Event ----
function startEditEvent(id, name, date, time, end_time, location, maps_url, capacity) {
  document.getElementById(`edit-form-${id}`).classList.remove('hidden');
  document.getElementById(`edit-name-${id}`).value = name;
  document.getElementById(`edit-date-${id}`).value = date;
  document.getElementById(`edit-time-${id}`).value = time;
  document.getElementById(`edit-end-time-${id}`).value = end_time;
  document.getElementById(`edit-location-${id}`).value = location;
  document.getElementById(`edit-maps-url-${id}`).value = maps_url;
  document.getElementById(`edit-capacity-${id}`).value = capacity;
}

function cancelEdit(id) {
  document.getElementById(`edit-form-${id}`).classList.add('hidden');
}

async function saveEvent(id) {
  const name = document.getElementById(`edit-name-${id}`).value.trim();
  const date = document.getElementById(`edit-date-${id}`).value;
  const time = document.getElementById(`edit-time-${id}`).value;
  const end_time = document.getElementById(`edit-end-time-${id}`).value;
  const location = document.getElementById(`edit-location-${id}`).value.trim();
  const maps_url = document.getElementById(`edit-maps-url-${id}`).value.trim();
  const capacity = document.getElementById(`edit-capacity-${id}`).value;

  if (!name) { alert('Event name is required'); return; }

  const res = await fetch(`/api/events/${id}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name, date: date || null, time: time || null, end_time: end_time || null, location: location || null, maps_url: maps_url || null, capacity: capacity ? parseInt(capacity) : null })
  });
  if (res.ok) { window.location.reload(); } else { alert('Failed to save event'); }
}

// ---- Delete Event ----
async function deleteEvent(id, name) {
  if (!confirm(`Delete "${name}" and all its registrations? This cannot be undone.`)) return;
  const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
  if (res.ok) { window.location.reload(); } else { alert('Failed to delete event'); }
}

// ---- Embed Modal ----
function showEmbed(eventId, slug) {
  const code = `<iframe src="${window.location.origin}/embed?event=${slug}&embed=true" width="100%" height="600" frameborder="0" style="border-radius:8px;"></iframe>`;
  document.getElementById('embed-code').value = code;
  document.getElementById('embed-preview-link').href = `/embed?event=${slug}`;
  document.getElementById('embed-modal').classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function copyEmbed() {
  const ta = document.getElementById('embed-code'); ta.select(); document.execCommand('copy');
  const btn = ta.nextElementSibling; btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy Code', 2000);
}

// ---- Registrations Table ----
window.loadRegistrations = async function(eventId, eventName) {
  currentEventId = eventId;
  const container = document.getElementById('registrations-table-container');
  const exportBtns = document.getElementById('export-buttons');

  if (!eventId) {
    exportBtns.style.display = 'none';
    container.innerHTML = '<div class="empty-state"><p>Select an event above to view registrations.</p></div>';
    return;
  }

  exportBtns.style.display = 'flex';
  container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  const sel = document.getElementById('event-filter');
  for (let opt of sel.options) { if (opt.value === eventId) { sel.value = eventId; break; } }

  try {
    const [regsRes, fieldsRes] = await Promise.all([
      fetch(`/api/events/${eventId}/registrations`),
      fetch(`/api/events/${eventId}/form-fields`)
    ]);
    allRegistrations = await regsRes.json();
    window._cachedFields = await fieldsRes.json();
    renderTable(allRegistrations, window._cachedFields);
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Failed to load registrations.</p></div>';
  }
};

function renderTable(regs, fields) {
  const container = document.getElementById('registrations-table-container');
  if (regs.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No registrations yet for this event.</p></div>';
    return;
  }

  const cols = ['Full Name', 'Email', 'Phone', 'Company', ...fields.map(f => f.label), 'Status', 'Checked In', 'Registered At'];
  const thead = `<tr>${cols.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr>`;

  const tbody = regs.map(r => {
    const custom = r.custom_data ? JSON.parse(r.custom_data) : {};
    const statusCell = r.waitlisted
      ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:700">Waitlist</span>'
      : '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:700">Confirmed</span>';
    const checkinCell = r.checked_in
      ? '<span class="checked-in-yes">✓ Yes</span>'
      : '<span class="checked-in-no">✗ No</span>';

    const cells = [
      escHtml(r.full_name), escHtml(r.email), escHtml(r.phone || ''), escHtml(r.company || ''),
      ...fields.map(f => escHtml(custom[f.id] || '')),
      statusCell, checkinCell,
      escHtml(new Date(r.created_at).toLocaleString())
    ];
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="reg-table-wrapper">
      <table class="reg-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </div>
    <p class="text-muted text-sm" style="margin-top:8px">${regs.length} record${regs.length !== 1 ? 's' : ''}</p>
  `;
}

function filterRegs(q) {
  if (!allRegistrations.length) return;
  const lower = q.toLowerCase();
  const filtered = allRegistrations.filter(r =>
    r.full_name.toLowerCase().includes(lower) || r.email.toLowerCase().includes(lower) || (r.phone || '').includes(q)
  );
  renderTable(filtered, window._cachedFields || []);
}

function exportData(type) {
  if (!currentEventId) return;
  window.open(`/api/events/${currentEventId}/registrations/${type}`, '_blank');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Import Registrations ----
let importEventId = null;
let importFile = null;

function openImport(eventId, eventName) {
  importEventId = eventId;
  importFile = null;
  document.getElementById('import-event-name').textContent = eventName;
  document.getElementById('import-file-name').textContent = '';
  document.getElementById('import-result').style.display = 'none';
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-submit-btn').disabled = true;
  document.getElementById('import-modal').classList.remove('hidden');

  const dz = document.getElementById('import-drop-zone');
  dz.ondragover = (e) => { e.preventDefault(); dz.style.borderColor = '#2563eb'; };
  dz.ondragleave = () => { dz.style.borderColor = '#cbd5e1'; };
  dz.ondrop = (e) => {
    e.preventDefault(); dz.style.borderColor = '#cbd5e1';
    const f = e.dataTransfer.files[0];
    if (f) setImportFile(f);
  };
}

function onImportFileChosen(input) {
  if (input.files[0]) setImportFile(input.files[0]);
}

function setImportFile(f) {
  importFile = f;
  document.getElementById('import-file-name').textContent = f.name;
  document.getElementById('import-submit-btn').disabled = false;
  document.getElementById('import-result').style.display = 'none';
}

async function submitImport() {
  if (!importFile || !importEventId) return;
  const btn = document.getElementById('import-submit-btn');
  btn.disabled = true; btn.textContent = 'Importing…';

  const fd = new FormData();
  fd.append('file', importFile);

  try {
    const res = await fetch(`/api/events/${importEventId}/import`, { method: 'POST', body: fd });
    const data = await res.json();
    const resultEl = document.getElementById('import-result');
    resultEl.style.display = 'block';
    if (res.ok) {
      resultEl.style.background = '#f0fdf4'; resultEl.style.color = '#15803d'; resultEl.style.border = '1px solid #bbf7d0';
      resultEl.innerHTML = `<strong>Done!</strong> Imported <strong>${data.imported}</strong> registrations.${data.skipped > 0 ? ` <span style="color:#92400e">${data.skipped} skipped (missing name/email or duplicate).</span>` : ''}${data.errors.length ? '<br><small style="color:#b91c1c">' + data.errors.join('<br>') + '</small>' : ''}`;
      if (data.imported > 0) {
        btn.textContent = 'Done — Reload Page';
        btn.disabled = false;
        btn.onclick = () => window.location.reload();
        return;
      }
    } else {
      resultEl.style.background = '#fef2f2'; resultEl.style.color = '#b91c1c'; resultEl.style.border = '1px solid #fecaca';
      resultEl.textContent = data.error || 'Import failed';
    }
  } catch {
    const resultEl = document.getElementById('import-result');
    resultEl.style.display = 'block'; resultEl.style.background = '#fef2f2'; resultEl.style.color = '#b91c1c'; resultEl.style.border = '1px solid #fecaca';
    resultEl.textContent = 'Network error';
  }
  btn.disabled = false; btn.textContent = 'Upload & Import';
}

if (window.location.hash) {
  const id = window.location.hash.replace('#event-', '');
  if (id && document.getElementById(`event-${id}`)) {
    setTimeout(() => loadRegistrations(id, ''), 100);
    document.getElementById(`event-${id}`).scrollIntoView({ behavior: 'smooth' });
  }
}
