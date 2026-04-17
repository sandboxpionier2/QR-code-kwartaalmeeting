import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

// Deze check-in app leest de bestaande `participants` tabel (aangemaakt door
// de aanmeld-app) en voegt in dezelfde DB twee nieuwe tabellen toe:
//  - participant_tokens : uniek check-in token per deelnemer
//  - checkins           : registreert wie er op welk moment is ingecheckt
// De originele `participants` tabel wordt NIET aangepast.

const DB_PATH =
  process.env.DB_PATH ??
  path.resolve(
    process.cwd(),
    '..',
    'Uitnodiging-kwartaalmeeting',
    'data',
    'workshops.sqlite'
  );

if (!fs.existsSync(DB_PATH)) {
  console.warn(
    `[checkin-app] Waarschuwing: database bestand niet gevonden op ${DB_PATH}. ` +
      `Controleer DB_PATH in .env of start eerst de aanmeld-app zodat de DB wordt aangemaakt.`
  );
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS participant_tokens (
      token TEXT PRIMARY KEY,
      participant_id INTEGER NOT NULL UNIQUE,
      meeting_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_participant_tokens_meeting
      ON participant_tokens(meeting_id);

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL UNIQUE,
      meeting_id TEXT NOT NULL,
      checked_in_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_checkins_meeting
      ON checkins(meeting_id);
  `);
}

// Controleer of de `participants` tabel uit de aanmeld-app bestaat.
export function hasParticipantsTable() {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='participants'`
    )
    .get();
  return Boolean(row);
}

// Workshops tabel uit de aanmeld-app lezen (read-only).
export function getWorkshops() {
  try {
    return db
      .prepare('SELECT id, name FROM workshops ORDER BY name')
      .all();
  } catch {
    return [];
  }
}

// Genereer een kort, URL-veilig token (niet te raden).
function newToken() {
  // 12 bytes -> 16 char base64url; ruim genoeg en compact in de QR.
  return crypto.randomBytes(12).toString('base64url');
}

export function ensureTokensForAllParticipants({ meetingId }) {
  if (!hasParticipantsTable()) {
    return { created: 0, total: 0 };
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO participant_tokens (token, participant_id, meeting_id)
     VALUES (?, ?, ?)`
  );

  const rows = db
    .prepare(
      `SELECT p.id
       FROM participants p
       LEFT JOIN participant_tokens t ON t.participant_id = p.id
       WHERE p.meeting_id = ? AND t.token IS NULL`
    )
    .all(meetingId);

  const tx = db.transaction((list) => {
    let created = 0;
    for (const r of list) {
      const info = insert.run(newToken(), r.id, meetingId);
      if (info.changes > 0) created += 1;
    }
    return created;
  });

  const created = tx(rows);
  const total = db
    .prepare(`SELECT COUNT(*) AS cnt FROM participant_tokens WHERE meeting_id = ?`)
    .get(meetingId).cnt;

  return { created, total };
}

export function getAllParticipantsWithTokens({ meetingId }) {
  if (!hasParticipantsTable()) return [];
  return db
    .prepare(
      `SELECT
         p.id           AS participantId,
         p.name         AS name,
         p.assigned_workshop_id AS assignedWorkshopId,
         w.name         AS assignedWorkshopName,
         p.dietary_notes AS dietaryNotes,
         t.token        AS token,
         c.checked_in_at AS checkedInAt
       FROM participants p
       LEFT JOIN workshops w ON w.id = p.assigned_workshop_id
       LEFT JOIN participant_tokens t ON t.participant_id = p.id
       LEFT JOIN checkins c ON c.participant_id = p.id
       WHERE p.meeting_id = ?
       ORDER BY p.name COLLATE NOCASE ASC`
    )
    .all(meetingId);
}

export function getParticipantByToken(token) {
  if (!hasParticipantsTable()) return null;
  const row = db
    .prepare(
      `SELECT
         p.id            AS participantId,
         p.name          AS name,
         p.meeting_id    AS meetingId,
         p.assigned_workshop_id AS assignedWorkshopId,
         w.name          AS assignedWorkshopName,
         c.checked_in_at AS checkedInAt
       FROM participant_tokens t
       JOIN participants p ON p.id = t.participant_id
       LEFT JOIN workshops w ON w.id = p.assigned_workshop_id
       LEFT JOIN checkins c ON c.participant_id = p.id
       WHERE t.token = ?`
    )
    .get(token);
  return row ?? null;
}

export function markCheckedIn({ participantId, meetingId }) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO checkins (participant_id, meeting_id)
     VALUES (?, ?)`
  );
  stmt.run(participantId, meetingId);
  // Haal de (eventueel bestaande) check-in tijd terug.
  const row = db
    .prepare(
      `SELECT checked_in_at FROM checkins WHERE participant_id = ?`
    )
    .get(participantId);
  return row?.checked_in_at ?? null;
}

export function getCheckinStats({ meetingId }) {
  if (!hasParticipantsTable()) {
    return { totalParticipants: 0, totalCheckedIn: 0, byWorkshop: [] };
  }
  const totalParticipants = db
    .prepare(`SELECT COUNT(*) AS cnt FROM participants WHERE meeting_id = ?`)
    .get(meetingId).cnt;

  const totalCheckedIn = db
    .prepare(`SELECT COUNT(*) AS cnt FROM checkins WHERE meeting_id = ?`)
    .get(meetingId).cnt;

  const byWorkshop = db
    .prepare(
      `SELECT
         w.id   AS workshopId,
         w.name AS workshopName,
         (SELECT COUNT(*) FROM participants p2 WHERE p2.meeting_id = ? AND p2.assigned_workshop_id = w.id) AS totalAssigned,
         (SELECT COUNT(*) FROM participants p3
           JOIN checkins c ON c.participant_id = p3.id
           WHERE p3.meeting_id = ? AND p3.assigned_workshop_id = w.id) AS totalCheckedIn
       FROM workshops w
       ORDER BY w.name`
    )
    .all(meetingId, meetingId);

  return { totalParticipants, totalCheckedIn, byWorkshop };
}
