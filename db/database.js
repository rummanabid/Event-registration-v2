const Database = require('better-sqlite3');
const path = require('path');

// Use RAILWAY_VOLUME_MOUNT_PATH if available (persistent disk), otherwise local db/
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_PATH = path.join(DATA_DIR, 'events.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
  }
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      date TEXT,
      location TEXT,
      capacity INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS form_fields (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      field_type TEXT NOT NULL,
      label TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 0,
      options TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS field_config (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_required INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      custom_data TEXT,
      qr_token TEXT UNIQUE NOT NULL,
      checked_in INTEGER NOT NULL DEFAULT 0,
      checked_in_at TEXT,
      waitlisted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );
  `);

  // Safe column additions for existing databases
  const safeAlter = (sql) => { try { db.exec(sql); } catch (e) {} };
  safeAlter('ALTER TABLE events ADD COLUMN capacity INTEGER');
  safeAlter('ALTER TABLE events ADD COLUMN maps_url TEXT');
  safeAlter('ALTER TABLE events ADD COLUMN time TEXT');
  safeAlter('ALTER TABLE events ADD COLUMN end_time TEXT');
  safeAlter('ALTER TABLE registrations ADD COLUMN waitlisted INTEGER NOT NULL DEFAULT 0');

  // Drop NOT NULL constraint on registrations.email by recreating the table
  const emailNotNull = db.prepare(`SELECT "notnull" FROM pragma_table_info('registrations') WHERE name='email'`).get();
  if (emailNotNull && emailNotNull.notnull === 1) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE registrations_new (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        custom_data TEXT,
        qr_token TEXT UNIQUE NOT NULL,
        checked_in INTEGER NOT NULL DEFAULT 0,
        checked_in_at TEXT,
        waitlisted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );
      INSERT INTO registrations_new SELECT * FROM registrations;
      DROP TABLE registrations;
      ALTER TABLE registrations_new RENAME TO registrations;
      PRAGMA foreign_keys = ON;
    `);
  }
}

module.exports = { getDb };
