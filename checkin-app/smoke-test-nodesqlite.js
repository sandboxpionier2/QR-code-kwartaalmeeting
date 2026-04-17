// Alternatieve smoke test die Node's ingebouwde `node:sqlite` gebruikt
// (omdat de geprebuilde better-sqlite3 binary in deze sandbox niet laadt).
// Hiermee valideren we dat de SQL-logica van de check-in app correct is.
// In productie gebruikt de app better-sqlite3 (identieke SQL).

import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

// --- 1) Zet de tabellen uit de aanmeld-app op ---
db.exec(`
  CREATE TABLE workshops (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    name TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    assigned_workshop_id TEXT NOT NULL,
    ranked_json TEXT,
    dietary_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.prepare(`INSERT INTO workshops (id, name) VALUES (?, ?)`).run('innovatie', 'De Gouden Schakel');
db.prepare(`INSERT INTO workshops (id, name) VALUES (?, ?)`).run('dienstverlening', 'De Zilverveer');
db.prepare(`INSERT INTO workshops (id, name) VALUES (?, ?)`).run('datafin', 'De Koperdraad');

const ins = db.prepare(
  `INSERT INTO participants (meeting_id, name, answers_json, scores_json, assigned_workshop_id)
   VALUES (?, ?, ?, ?, ?)`
);
ins.run('default', 'Marieke de Vries', '{}', '{}', 'innovatie');
ins.run('default', 'Jan-Peter Jansen', '{}', '{}', 'dienstverlening');
ins.run('default', 'Fatima El Amrani', '{}', '{}', 'datafin');

// --- 2) Pas dezelfde migraties toe als de echte db.js ---
db.exec(`
  CREATE TABLE IF NOT EXISTS participant_tokens (
    token TEXT PRIMARY KEY,
    participant_id INTEGER NOT NULL UNIQUE,
    meeting_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER NOT NULL UNIQUE,
    meeting_id TEXT NOT NULL,
    checked_in_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

let failures = 0;
const assert = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failures++;
};

// --- 3) Token-generatie: maak voor elke deelnemer zonder token er één aan ---
console.log('\n[1] Token generatie');
{
  const newToken = () => crypto.randomBytes(12).toString('base64url');
  const missing = db.prepare(
    `SELECT p.id FROM participants p
     LEFT JOIN participant_tokens t ON t.participant_id = p.id
     WHERE p.meeting_id = ? AND t.token IS NULL`
  ).all('default');

  const insertToken = db.prepare(
    `INSERT OR IGNORE INTO participant_tokens (token, participant_id, meeting_id) VALUES (?, ?, ?)`
  );

  let created = 0;
  for (const r of missing) {
    const info = insertToken.run(newToken(), r.id, 'default');
    if (info.changes > 0) created++;
  }

  assert(created === 3, '3 nieuwe tokens aangemaakt (kreeg: ' + created + ')');

  // Idempotent?
  const missing2 = db.prepare(
    `SELECT p.id FROM participants p
     LEFT JOIN participant_tokens t ON t.participant_id = p.id
     WHERE p.meeting_id = ? AND t.token IS NULL`
  ).all('default');
  assert(missing2.length === 0, 'idempotent: 2e run voegt niets meer toe');
}

// --- 4) Admin lijst query ---
console.log('\n[2] Admin-lijst query');
let firstToken = null;
{
  const rows = db.prepare(
    `SELECT p.id AS participantId, p.name AS name,
            p.assigned_workshop_id AS assignedWorkshopId,
            w.name AS assignedWorkshopName,
            t.token AS token,
            c.checked_in_at AS checkedInAt
     FROM participants p
     LEFT JOIN workshops w ON w.id = p.assigned_workshop_id
     LEFT JOIN participant_tokens t ON t.participant_id = p.id
     LEFT JOIN checkins c ON c.participant_id = p.id
     WHERE p.meeting_id = ?
     ORDER BY p.name COLLATE NOCASE ASC`
  ).all('default');

  assert(rows.length === 3, '3 rijen');
  assert(rows.every((r) => !!r.token), 'iedereen heeft een token');
  assert(rows.every((r) => !!r.assignedWorkshopName), 'workshopnaam opgelost');
  assert(rows.every((r) => !r.checkedInAt), 'niemand is ingecheckt');
  firstToken = rows[0].token;
}

// --- 5) Lookup by token ---
console.log('\n[3] Opzoeken op token');
{
  const row = db.prepare(
    `SELECT p.id AS participantId, p.name AS name, p.meeting_id AS meetingId,
            w.name AS assignedWorkshopName, c.checked_in_at AS checkedInAt
     FROM participant_tokens t
     JOIN participants p ON p.id = t.participant_id
     LEFT JOIN workshops w ON w.id = p.assigned_workshop_id
     LEFT JOIN checkins c ON c.participant_id = p.id
     WHERE t.token = ?`
  ).get(firstToken);
  assert(!!row, 'deelnemer gevonden');
  assert(typeof row.name === 'string' && row.name.length > 0, 'naam aanwezig');
  assert(typeof row.assignedWorkshopName === 'string', 'workshopnaam aanwezig');
}

// --- 6) Check-in insert (met UNIQUE constraint) ---
console.log('\n[4] Check-in registreren');
{
  const lookup = db.prepare(`SELECT participant_id FROM participant_tokens WHERE token = ?`).get(firstToken);
  const insertCheckin = db.prepare(
    `INSERT OR IGNORE INTO checkins (participant_id, meeting_id) VALUES (?, ?)`
  );
  const r1 = insertCheckin.run(lookup.participant_id, 'default');
  assert(r1.changes === 1, 'eerste insert succesvol');

  const r2 = insertCheckin.run(lookup.participant_id, 'default');
  assert(r2.changes === 0, 'tweede insert is no-op (unique)');

  const row = db.prepare(`SELECT checked_in_at FROM checkins WHERE participant_id = ?`).get(lookup.participant_id);
  assert(typeof row.checked_in_at === 'string' && row.checked_in_at.length > 0, 'check-in tijdstempel opgeslagen');
}

// --- 7) Stats ---
console.log('\n[5] Dashboard stats query');
{
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM participants WHERE meeting_id = ?`).get('default').cnt;
  const checkedIn = db.prepare(`SELECT COUNT(*) AS cnt FROM checkins WHERE meeting_id = ?`).get('default').cnt;
  assert(total === 3, 'totaal = 3');
  assert(checkedIn === 1, 'ingecheckt = 1');

  const per = db.prepare(
    `SELECT w.id AS workshopId, w.name AS workshopName,
            (SELECT COUNT(*) FROM participants p2 WHERE p2.meeting_id = ? AND p2.assigned_workshop_id = w.id) AS totalAssigned,
            (SELECT COUNT(*) FROM participants p3 JOIN checkins c ON c.participant_id = p3.id
               WHERE p3.meeting_id = ? AND p3.assigned_workshop_id = w.id) AS totalCheckedIn
     FROM workshops w ORDER BY w.name`
  ).all('default', 'default');
  assert(per.length === 3, '3 workshops in stats');
  assert(per.reduce((s, w) => s + w.totalAssigned, 0) === 3, 'som totalAssigned = 3');
  assert(per.reduce((s, w) => s + w.totalCheckedIn, 0) === 1, 'som totalCheckedIn = 1');
}

// --- 8) Onbekende token ---
console.log('\n[6] Onbekende token');
{
  const row = db.prepare(`SELECT participant_id FROM participant_tokens WHERE token = ?`).get('not-a-real-token');
  assert(!row, 'onbekende token geeft geen resultaat');
}

console.log('\n' + (failures === 0 ? '✅ ALLE DB-TESTS GESLAAGD' : '❌ ' + failures + ' TESTS GEFAALD'));
process.exit(failures === 0 ? 0 : 1);
