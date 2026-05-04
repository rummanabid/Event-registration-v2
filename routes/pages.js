const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { generateQRDataURL } = require('../utils/qr');

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Home
router.get('/', (req, res) => {
  const db = getDb();
  const events = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) as registration_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = 1) as checked_in_count
    FROM events e ORDER BY e.created_at DESC
  `).all();
  res.render('home', { events, formatDate });
});

// Admin
router.get('/admin', (req, res) => {
  const db = getDb();
  const events = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) as registration_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = 1) as checked_in_count
    FROM events e ORDER BY e.created_at DESC
  `).all();
  res.render('admin', { events, formatDate });
});

// Form Builder
router.get('/form-builder/:eventId', (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.eventId);
  if (!event) return res.status(404).render('error', { message: 'Event not found' });

  const fieldConfig = db.prepare('SELECT * FROM field_config WHERE event_id = ?').all(req.params.eventId);
  const formFields = db.prepare('SELECT * FROM form_fields WHERE event_id = ? ORDER BY sort_order').all(req.params.eventId);

  const config = {};
  fieldConfig.forEach(f => { config[f.field_name] = f; });

  res.render('form-builder', { event, fieldConfig: config, formFields });
});

// Embed / Registration Form
router.get('/embed', async (req, res) => {
  const db = getDb();
  const slug = req.query.event;
  if (!slug) return res.status(400).render('error', { message: 'Event slug is required' });

  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) return res.status(404).render('error', { message: 'Event not found' });

  const fieldConfig = db.prepare('SELECT * FROM field_config WHERE event_id = ?').all(event.id);
  const formFields = db.prepare('SELECT * FROM form_fields WHERE event_id = ? ORDER BY sort_order').all(event.id);

  const config = {};
  fieldConfig.forEach(f => { config[f.field_name] = f; });

  const isEmbed = req.query.embed === 'true' || req.headers['sec-fetch-dest'] === 'iframe';

  res.render('embed', { event, fieldConfig: config, formFields, formatDate, isEmbed, success: false });
});

// Registration success (POST redirect workaround via query param)
router.get('/register-success', async (req, res) => {
  const db = getDb();
  const { reg_id } = req.query;
  if (!reg_id) return res.redirect('/');

  const reg = db.prepare('SELECT r.*, e.name as event_name, e.date as event_date, e.location as event_location, e.slug as event_slug FROM registrations r JOIN events e ON r.event_id = e.id WHERE r.id = ?').get(reg_id);
  if (!reg) return res.redirect('/');

  const baseUrl = getBaseUrl(req);
  const qrUrl = `${baseUrl}/checkin/${reg.qr_token}`;
  const qrDataUrl = await generateQRDataURL(qrUrl);

  const isEmbed = req.query.embed === 'true';

  res.render('success', { reg, qrDataUrl, qrUrl, formatDate, isEmbed, baseUrl });
});

// QR Scanner
router.get('/scan', (req, res) => {
  const db = getDb();
  const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  res.render('scan', { events, formatDate });
});

// Direct check-in page
router.get('/checkin/:qrToken', (req, res) => {
  const db = getDb();
  const token = req.params.qrToken;

  const reg = db.prepare('SELECT r.*, e.name as event_name, e.date as event_date, e.location as event_location FROM registrations r JOIN events e ON r.event_id = e.id WHERE r.qr_token = ?').get(token);

  if (!reg) {
    return res.render('checkin', { status: 'invalid', reg: null, formatDate });
  }

  if (reg.checked_in) {
    return res.render('checkin', { status: 'already_checked_in', reg, formatDate });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE registrations SET checked_in = 1, checked_in_at = ? WHERE qr_token = ?').run(now, token);
  reg.checked_in_at = now;

  res.render('checkin', { status: 'success', reg, formatDate });
});

// .ics calendar download
router.get('/calendar/:eventId.ics', (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.eventId);
  if (!event) return res.status(404).send('Not found');

  const now = new Date();
  const start = event.date ? new Date(event.date) : now;
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  function icsDate(d) {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Events QR Check-in//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@events-qr-checkin`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${event.name}`,
    event.location ? `LOCATION:${event.location}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="${event.slug}.ics"`);
  res.send(ics);
});

module.exports = router;
