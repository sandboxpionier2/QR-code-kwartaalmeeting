import crypto from 'node:crypto';
import { getFirestore, FieldValue } from './firestore.js';

// --- Schema ---
//
// De aanmeld-app gebruikt deze collecties (wij lezen alleen, we schrijven niks):
//   meetings/{meetingId}/participants/{participantId}   — aanmeldingen
//   meetingStats/{meetingId}                            — capaciteitstellers
//
// Deze check-in app gebruikt TWEE nieuwe sub-collecties in dezelfde
// meeting, zodat we de aanmeld-data niet aanraken:
//   meetings/{meetingId}/checkinTokens/{token}          — { participantId, createdAt }
//   meetings/{meetingId}/checkins/{participantId}       — { checkedInAt, token }
//
// Lookup op token = O(1) (doc-id lookup). Uniciteit van check-in
// wordt afgedwongen door de participantId als doc-id te gebruiken.

function newToken() {
  // 12 bytes base64url = 16 tekens, niet te raden.
  return crypto.randomBytes(12).toString('base64url');
}

// Firestore Timestamps serialiseren niet netjes naar JSON. Deze helper
// geeft altijd een ISO-string terug (of null) zodat clients er gewoon
// `new Date(...)` op kunnen doen.
function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.round((value._nanoseconds ?? 0) / 1e6)).toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function refs(meetingId) {
  const db = getFirestore();
  const meetingRef = db.collection('meetings').doc(meetingId);
  return {
    db,
    meetingRef,
    participants: meetingRef.collection('participants'),
    tokens: meetingRef.collection('checkinTokens'),
    checkins: meetingRef.collection('checkins'),
  };
}

function normalizeWorkshopInfo(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeName(data, fallbackId) {
  const direct =
    (typeof data.name === 'string' && data.name.trim()) ||
    (typeof data.fullName === 'string' && data.fullName.trim()) ||
    (typeof data.displayName === 'string' && data.displayName.trim());
  if (direct) return direct;

  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : '';
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  if (typeof data.email === 'string' && data.email.trim()) return data.email.trim();
  return typeof fallbackId === 'string' ? fallbackId : '';
}

// Haal alle bestaande deelnemers op uit de aanmeld-collectie (read-only).
async function getAllParticipants(meetingId) {
  const { participants } = refs(meetingId);
  // orderBy createdAt desc is wat de aanmeld-app doet; voor ons is
  // alfabetisch handiger, maar createdAt is gegarandeerd aanwezig.
  const snap = await participants.limit(1000).get();
  return snap.docs.map((d) => {
    const data = d.data() ?? {};
    return {
      participantId: d.id,
      name: normalizeName(data, d.id),
      assignedWorkshopId:
        typeof data.assignedWorkshopId === 'string' ? data.assignedWorkshopId : '',
      dietaryNotes: typeof data.dietaryNotes === 'string' ? data.dietaryNotes : '',
      workshopInfo: normalizeWorkshopInfo(data.workshopInfo),
      createdAt: toIso(data.createdAt),
    };
  });
}

export async function getParticipantOptions(meetingId) {
  const participants = await getAllParticipants(meetingId);
  return participants
    .map((p) => ({
      participantId: p.participantId,
      name: p.name,
    }))
    .filter((p) => p.participantId && p.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

export async function getParticipantById(meetingId, participantId) {
  if (!participantId || typeof participantId !== 'string') return null;
  const { participants, checkins } = refs(meetingId);
  const [pSnap, cSnap] = await Promise.all([
    participants.doc(participantId).get(),
    checkins.doc(participantId).get(),
  ]);
  if (!pSnap.exists) return null;
  const p = pSnap.data() ?? {};
  return {
    participantId,
    meetingId,
    name: normalizeName(p, participantId),
    assignedWorkshopId:
      typeof p.assignedWorkshopId === 'string' ? p.assignedWorkshopId : '',
    workshopInfo: normalizeWorkshopInfo(p.workshopInfo),
    checkedInAt: cSnap.exists ? toIso(cSnap.data()?.checkedInAt) : null,
  };
}

// Genereer een token voor elke deelnemer die er nog geen heeft.
// Idempotent: bestaande tokens blijven staan.
export async function ensureTokensForAllParticipants(meetingId) {
  const { tokens, checkins } = refs(meetingId);
  const [participants, tokenSnap] = await Promise.all([
    getAllParticipants(meetingId),
    tokens.get(),
  ]);

  const participantIdToToken = new Map();
  tokenSnap.forEach((doc) => {
    const d = doc.data() ?? {};
    if (typeof d.participantId === 'string') {
      participantIdToToken.set(d.participantId, doc.id);
    }
  });

  const missing = participants.filter((p) => !participantIdToToken.has(p.participantId));

  // Firestore batch writes: max 500 per batch.
  let created = 0;
  for (let i = 0; i < missing.length; i += 400) {
    const chunk = missing.slice(i, i + 400);
    const batch = getFirestore().batch();
    for (const p of chunk) {
      const token = newToken();
      batch.set(tokens.doc(token), {
        participantId: p.participantId,
        createdAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
    await batch.commit();
  }

  const total = participantIdToToken.size + created;
  return { created, total };
}

// Zoek deelnemer op via token (één doc-read).
export async function getParticipantByToken(meetingId, token) {
  if (!token || typeof token !== 'string') return null;
  const { tokens, participants, checkins } = refs(meetingId);
  const tokenSnap = await tokens.doc(token).get();
  if (!tokenSnap.exists) return null;
  const participantId = tokenSnap.data()?.participantId;
  if (typeof participantId !== 'string') return null;

  const [pSnap, cSnap] = await Promise.all([
    participants.doc(participantId).get(),
    checkins.doc(participantId).get(),
  ]);
  if (!pSnap.exists) return null;
  const p = pSnap.data() ?? {};

  return {
    participantId,
    token,
    meetingId,
    name: normalizeName(p, participantId),
    assignedWorkshopId:
      typeof p.assignedWorkshopId === 'string' ? p.assignedWorkshopId : '',
    workshopInfo: normalizeWorkshopInfo(p.workshopInfo),
    checkedInAt: cSnap.exists ? toIso(cSnap.data()?.checkedInAt) : null,
  };
}

// Registreer een check-in. Eerste keer maakt doc aan, tweede keer is no-op.
export async function markCheckedIn({ meetingId, participantId, token }) {
  const { checkins } = refs(meetingId);
  const ref = checkins.doc(participantId);
  const existing = await ref.get();
  if (existing.exists) {
    return {
      alreadyCheckedIn: true,
      checkedInAt: toIso(existing.data()?.checkedInAt),
    };
  }
  await ref.set({
    token: typeof token === 'string' ? token : 'shared-qr',
    checkedInAt: FieldValue.serverTimestamp(),
  });
  const after = await ref.get();
  return {
    alreadyCheckedIn: false,
    checkedInAt: toIso(after.data()?.checkedInAt),
  };
}

// Voor het dashboard: alle deelnemers incl. token + check-in status.
export async function getAdminOverview(meetingId) {
  const { tokens, checkins } = refs(meetingId);
  const [participants, tokensSnap, checkinsSnap] = await Promise.all([
    getAllParticipants(meetingId),
    tokens.get(),
    checkins.get(),
  ]);

  const pIdToToken = new Map();
  tokensSnap.forEach((d) => {
    const pid = d.data()?.participantId;
    if (typeof pid === 'string') pIdToToken.set(pid, d.id);
  });

  const pIdToCheckin = new Map();
  checkinsSnap.forEach((d) => {
    pIdToCheckin.set(d.id, toIso(d.data()?.checkedInAt));
  });

  return participants
    .map((p) => ({
      participantId: p.participantId,
      name: p.name,
      assignedWorkshopId: p.assignedWorkshopId,
      dietaryNotes: p.dietaryNotes,
      workshopInfo: p.workshopInfo,
      token: pIdToToken.get(p.participantId) ?? null,
      checkedInAt: pIdToCheckin.get(p.participantId) ?? null,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })
    );
}

// Workshops hebben in Firestore geen eigen collectie (de aanmeld-app
// houdt ze hard-coded). We dupliceren die lijst hier zodat we er namen
// aan kunnen hangen zonder de aanmeld-code te importeren. Deze moet
// synchroon blijven met server/workshops.js in de aanmeld-app.
export const WORKSHOPS = [
  { id: 'innovatie', name: 'De Gouden Schakel' },
  { id: 'dienstverlening', name: 'De Zilverveer' },
  { id: 'datafin', name: 'De Koperdraad' },
];

export function workshopName(id) {
  const w = WORKSHOPS.find((w) => w.id === id);
  return w?.name ?? id ?? null;
}

export function computeStats(overview) {
  const totalParticipants = overview.length;
  const totalCheckedIn = overview.filter((o) => !!o.checkedInAt).length;
  const byWorkshop = WORKSHOPS.map((w) => {
    const assigned = overview.filter((o) => o.assignedWorkshopId === w.id);
    return {
      workshopId: w.id,
      workshopName: w.name,
      totalAssigned: assigned.length,
      totalCheckedIn: assigned.filter((o) => !!o.checkedInAt).length,
    };
  });
  return { totalParticipants, totalCheckedIn, byWorkshop };
}
