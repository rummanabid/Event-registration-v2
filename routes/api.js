const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { generateQRBuffer, generateQRDataURL } = require('../utils/qr');
const { isEmailConfigured, sendQRCodeEmail } = require('../utils/email');
const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');
const archiver = require('archiver');

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function generateSlug(name, db) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let slug = base;
  let counter = 2;
  while (db.prepare('SELECT id FROM events WHERE slug = ?').get(slug)) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

// GET /api/events
router.get('/events', (req, res) => {
  const db = getDb();
  const events = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.waitlisted = 0) as registration_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = 1 AND r.waitlisted = 0) as checked_in_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.waitlisted = 1) as waitlist_count
    FROM events e ORDER BY e.created_at DESC
  `).all();
  res.json(events);
});

// POST /api/events
router.post('/events', (req, res) => {
  const db = getDb();
  const { name, date, location, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'Event name is required' });

  const id = uuidv4();
  const slug = generateSlug(name, db);
  const now = new Date().toISOString();

  db.prepare('INSERT INTO events (id, name, slug, date, location, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, slug, date || null, location || null, capacity ? parseInt(capacity) : null, now);
  db.prepare('INSERT INTO field_config (id, event_id, field_name, is_visible, is_required) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), id, 'phone', 1, 0);
  db.prepare('INSERT INTO field_config (id, event_id, field_name, is_visible, is_required) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), id, 'company', 1, 0);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.status(201).json(event);
});

// PUT /api/events/:id
router.put('/events/:id', (req, res) => {
  const db = getDb();
  const { name, date, location, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'Event name is required' });

  db.prepare('UPDATE events SET name = ?, date = ?, location = ?, capacity = ? WHERE id = ?').run(name, date || null, location || null, capacity ? parseInt(capacity) : null, req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// DELETE /api/events/:id
router.delete('/events/:id', (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/events/:id/registrations
router.get('/events/:id/registrations', (req, res) => {
  const db = getDb();
  const regs = db.prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(regs);
});

// GET /api/events/:id/registrations/csv
router.get('/events/:id/registrations/csv', (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const regs = db.prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC').all(req.params.id);
  const fields = db.prepare('SELECT * FROM form_fields WHERE event_id = ? ORDER BY sort_order').all(req.params.id);

  const rows = regs.map(r => {
    const custom = r.custom_data ? JSON.parse(r.custom_data) : {};
    const row = {
      'Full Name': r.full_name,
      'Email': r.email,
      'Phone': r.phone || '',
      'Company': r.company || '',
    };
    fields.forEach(f => { row[f.label] = custom[f.id] || ''; });
    row['Waitlisted'] = r.waitlisted ? 'Yes' : 'No';
    row['Checked In'] = r.checked_in ? 'Yes' : 'No';
    row['Checked In At'] = r.checked_in_at || '';
    row['Registered At'] = r.created_at;
    return row;
  });

  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-registrations.csv"`);
  res.send(csv);
});

// GET /api/events/:id/registrations/xlsx
router.get('/events/:id/registrations/xlsx', async (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const regs = db.prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC').all(req.params.id);
  const fields = db.prepare('SELECT * FROM form_fields WHERE event_id = ? ORDER BY sort_order').all(req.params.id);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Registrations');

  const columns = [
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Company', key: 'company', width: 25 },
    ...fields.map(f => ({ header: f.label, key: `custom_${f.id}`, width: 20 })),
    { header: 'Waitlisted', key: 'waitlisted', width: 12 },
    { header: 'Checked In', key: 'checked_in', width: 12 },
    { header: 'Checked In At', key: 'checked_in_at', width: 22 },
    { header: 'Registered At', key: 'created_at', width: 22 },
  ];
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

  regs.forEach(r => {
    const custom = r.custom_data ? JSON.parse(r.custom_data) : {};
    const row = {
      full_name: r.full_name, email: r.email, phone: r.phone || '',
      company: r.company || '', waitlisted: r.waitlisted ? 'Yes' : 'No',
      checked_in: r.checked_in ? 'Yes' : 'No', checked_in_at: r.checked_in_at || '', created_at: r.created_at,
    };
    fields.forEach(f => { row[`custom_${f.id}`] = custom[f.id] || ''; });
    sheet.addRow(row);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-registrations.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// POST /api/register
router.post('/register', async (req, res) => {
  const db = getDb();
  const { event_id, full_name, email, phone, company, custom_data } = req.body;

  if (!event_id || !full_name || !email) {
    return res.status(400).json({ error: 'event_id, full_name, and email are required' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Duplicate check
  const existing = db.prepare('SELECT id, qr_token FROM registrations WHERE event_id = ? AND email = ? AND waitlisted = 0').get(event_id, email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'ALREADY_REGISTERED', registrationId: existing.id });
  }

  // Capacity / waitlist check
  const confirmedCount = db.prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND waitlisted = 0').get(event_id).cnt;
  const isWaitlisted = event.capacity && confirmedCount >= event.capacity ? 1 : 0;

  const id = uuidv4();
  const qrToken = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO registrations (id, event_id, full_name, email, phone, company, custom_data, qr_token, checked_in, waitlisted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, event_id, full_name, email.toLowerCase().trim(), phone || null, company || null, custom_data ? JSON.stringify(custom_data) : null, qrToken, isWaitlisted, now);

  const baseUrl = getBaseUrl(req);
  const qrUrl = `${baseUrl}/checkin/${qrToken}`;
  const qrDataUrl = isWaitlisted ? null : await generateQRDataURL(qrUrl);

  // Auto-send QR email if SMTP configured and not waitlisted
  if (!isWaitlisted && isEmailConfigured()) {
    const qrBuffer = await generateQRBuffer(qrUrl);
    sendQRCodeEmail({
      to: email,
      attendeeName: full_name,
      eventName: event.name,
      eventDate: event.date,
      eventLocation: event.location,
      qrBuffer,
      eventSlug: event.slug
    }).catch(() => {}); // fire and forget
  }

  res.status(201).json({ id, qrToken, qrDataUrl, qrUrl, waitlisted: isWaitlisted === 1 });
});

// POST /api/checkin
router.post('/checkin', (req, res) => {
  const db = getDb();
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const reg = db.prepare('SELECT r.*, e.name as event_name FROM registrations r JOIN events e ON r.event_id = e.id WHERE r.qr_token = ?').get(token);
  if (!reg) return res.status(404).json({ error: 'Invalid QR code', status: 'invalid' });

  if (reg.checked_in) {
    return res.json({ status: 'already_checked_in', attendeeName: reg.full_name, eventName: reg.event_name, checkedInAt: reg.checked_in_at });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE registrations SET checked_in = 1, checked_in_at = ? WHERE qr_token = ?').run(now, token);
  res.json({ status: 'success', attendeeName: reg.full_name, eventName: reg.event_name });
});

// POST /api/manual-checkin/:registrationId
router.post('/manual-checkin/:registrationId', (req, res) => {
  const db = getDb();
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(req.params.registrationId);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });

  if (reg.checked_in) {
    return res.json({ status: 'already_checked_in', attendeeName: reg.full_name, checkedInAt: reg.checked_in_at });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE registrations SET checked_in = 1, checked_in_at = ? WHERE id = ?').run(now, reg.id);
  res.json({ status: 'success', attendeeName: reg.full_name });
});

// GET /api/events/:id/search-registrations
router.get('/events/:id/search-registrations', (req, res) => {
  const db = getDb();
  const q = `%${req.query.q || ''}%`;
  const regs = db.prepare(`
    SELECT * FROM registrations
    WHERE event_id = ? AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
    ORDER BY full_name LIMIT 20
  `).all(req.params.id, q, q, q);
  res.json(regs);
});

// GET /api/events/:id/field-config
router.get('/events/:id/field-config', (req, res) => {
  const db = getDb();
  const config = db.prepare('SELECT * FROM field_config WHERE event_id = ?').all(req.params.id);
  res.json(config);
});

// POST /api/events/:id/field-config
router.post('/events/:id/field-config', (req, res) => {
  const db = getDb();
  const { fields } = req.body;
  const existing = db.prepare('SELECT * FROM field_config WHERE event_id = ? AND field_name = ?');
  const saveField = db.transaction((field) => {
    const row = existing.get(req.params.id, field.field_name);
    if (row) {
      db.prepare('UPDATE field_config SET is_visible = ?, is_required = ? WHERE event_id = ? AND field_name = ?')
        .run(field.is_visible ? 1 : 0, field.is_required ? 1 : 0, req.params.id, field.field_name);
    } else {
      db.prepare('INSERT INTO field_config (id, event_id, field_name, is_visible, is_required) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), req.params.id, field.field_name, field.is_visible ? 1 : 0, field.is_required ? 1 : 0);
    }
  });
  fields.forEach(saveField);
  res.json({ success: true });
});

// GET /api/events/:id/form-fields
router.get('/events/:id/form-fields', (req, res) => {
  const db = getDb();
  const fields = db.prepare('SELECT * FROM form_fields WHERE event_id = ? ORDER BY sort_order').all(req.params.id);
  res.json(fields);
});

// POST /api/events/:id/form-fields
router.post('/events/:id/form-fields', (req, res) => {
  const db = getDb();
  const { fields } = req.body;
  const save = db.transaction(() => {
    db.prepare('DELETE FROM form_fields WHERE event_id = ?').run(req.params.id);
    fields.forEach((f, i) => {
      db.prepare(`INSERT INTO form_fields (id, event_id, field_type, label, is_required, options, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(f.id || uuidv4(), req.params.id, f.field_type, f.label, f.is_required ? 1 : 0, f.options ? JSON.stringify(f.options) : null, i);
    });
  });
  save();
  res.json({ success: true });
});

// POST /api/email-qr
router.post('/email-qr', async (req, res) => {
  const db = getDb();
  const { registrationId, email } = req.body;
  if (!isEmailConfigured()) return res.status(503).json({ error: 'EMAIL_NOT_CONFIGURED' });

  const reg = db.prepare('SELECT r.*, e.name as event_name, e.date as event_date, e.location as event_location, e.slug as event_slug FROM registrations r JOIN events e ON r.event_id = e.id WHERE r.id = ?').get(registrationId);
  if (!reg) return res.status(404).json({ error: 'Registration not found' });

  const baseUrl = getBaseUrl(req);
  const qrUrl = `${baseUrl}/checkin/${reg.qr_token}`;
  const qrBuffer = await generateQRBuffer(qrUrl);

  try {
    await sendQRCodeEmail({ to: email, attendeeName: reg.full_name, eventName: reg.event_name, eventDate: reg.event_date, eventLocation: reg.event_location, qrBuffer, eventSlug: reg.event_slug });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qr/:qrToken.png
router.get('/qr/:qrToken.png', async (req, res) => {
  const db = getDb();
  const reg = db.prepare('SELECT * FROM registrations WHERE qr_token = ?').get(req.params.qrToken);
  if (!reg) return res.status(404).send('Not found');

  const baseUrl = getBaseUrl(req);
  const qrUrl = `${baseUrl}/checkin/${req.params.qrToken}`;
  const buffer = await generateQRBuffer(qrUrl);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="qr-${req.params.qrToken}.png"`);
  res.send(buffer);
});

// GET /api/events/:id/checkin-count
router.get('/events/:id/checkin-count', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as total, SUM(checked_in) as checked_in FROM registrations WHERE event_id = ? AND waitlisted = 0').get(req.params.id);
  res.json({ total: row.total, checkedIn: row.checked_in || 0 });
});

// GET /api/analytics/data
router.get('/analytics/data', (req, res) => {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM events) as total_events,
      (SELECT COUNT(*) FROM registrations WHERE waitlisted = 0) as total_registrations,
      (SELECT COUNT(*) FROM registrations WHERE checked_in = 1 AND waitlisted = 0) as total_checked_in,
      (SELECT COUNT(*) FROM registrations WHERE waitlisted = 1) as total_waitlisted
  `).get();

  const eventStats = db.prepare(`
    SELECT e.id, e.name, e.date, e.capacity,
      COUNT(CASE WHEN r.waitlisted = 0 THEN 1 END) as registrations,
      COUNT(CASE WHEN r.checked_in = 1 AND r.waitlisted = 0 THEN 1 END) as checked_in,
      COUNT(CASE WHEN r.waitlisted = 1 THEN 1 END) as waitlisted
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all();

  // Last 14 days of registrations
  const dailyRaw = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM registrations
    WHERE waitlisted = 0 AND created_at >= date('now', '-13 days')
    GROUP BY day ORDER BY day
  `).all();

  const days = [], counts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    days.push(label);
    const found = dailyRaw.find(r => r.day === dayStr);
    counts.push(found ? found.count : 0);
  }

  res.json({ totals, eventStats, chart: { days, counts } });
});

// GET /api/events/:id/badges/illustrator — ZIP with CSV + QR PNGs for Illustrator Data Merge
router.get('/events/:id/badges/illustrator', async (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const registrations = db.prepare(
    'SELECT * FROM registrations WHERE event_id = ? AND waitlisted = 0 ORDER BY full_name'
  ).all(req.params.id);

  const baseUrl = getBaseUrl(req);
  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // Build CSV rows — @qr_image column tells Illustrator to treat it as an image variable
  const csvRows = registrations.map(r => ({
    name: r.full_name,
    company: r.company || '',
    email: r.email,
    phone: r.phone || '',
    event_name: event.name,
    event_date: eventDate,
    event_location: event.location || '',
    '@qr_image': `qr_${r.id}.png`
  }));

  const csv = stringify(csvRows, { header: true });

  // Stream a ZIP
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-illustrator-export.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  // Add the Data Merge CSV
  archive.append(csv, { name: 'data.csv' });

  // Add a README
  const readme = [
    `Illustrator Data Merge Export — ${event.name}`,
    '='.repeat(50),
    '',
    'HOW TO USE:',
    '1. Open your Illustrator badge template',
    '2. Go to Window > Utilities > Variables  (or Window > Data Merge in newer versions)',
    '3. Click the menu icon > Select Data Source',
    '4. Choose "data.csv" from this folder',
    '5. Make sure this folder also contains all the qr_*.png files',
    '6. Your template placeholders should match these column names:',
    '   <<name>>           — Attendee full name',
    '   <<company>>        — Company / organisation',
    '   <<email>>          — Email address',
    '   <<phone>>          — Phone number',
    '   <<event_name>>     — Event name',
    '   <<event_date>>     — Event date (formatted)',
    '   <<event_location>> — Event location',
    '   <<@qr_image>>      — QR code image (link a rectangle/image frame to this)',
    '',
    '7. Click "Create Merged Document" to generate all badges at once',
    '',
    `Total attendees: ${registrations.length}`,
  ].join('\n');

  archive.append(readme, { name: 'README.txt' });

  // Add each QR code PNG
  for (const r of registrations) {
    const qrUrl = `${baseUrl}/checkin/${r.qr_token}`;
    const qrBuffer = await generateQRBuffer(qrUrl);
    archive.append(qrBuffer, { name: `qr_${r.id}.png` });
  }

  await archive.finalize();
});

module.exports = router;
