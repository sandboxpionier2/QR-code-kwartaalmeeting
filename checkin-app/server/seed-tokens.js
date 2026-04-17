import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { initDb, ensureTokensForAllParticipants, hasParticipantsTable } from './db.js';

const MEETING_ID = process.env.MEETING_ID ?? 'default';

initDb();

if (!hasParticipantsTable()) {
  console.error(
    'Geen `participants` tabel gevonden. Start eerst de aanmeld-app en laat collega\'s zich inschrijven.'
  );
  process.exit(1);
}

const { created, total } = ensureTokensForAllParticipants({ meetingId: MEETING_ID });

console.log(`Tokens aangemaakt: ${created}`);
console.log(`Totaal aantal tokens in database: ${total}`);
