import { isAdminAuthorized, unauthorized } from '../../lib/auth.js';
import { clearCheckIn, getParticipantById } from '../../lib/checkin.js';
import { MEETING_ID } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdminAuthorized(req)) return unauthorized(res);

  try {
    const participantId = String(req.body?.participantId ?? '').trim();
    if (!participantId) {
      return res.status(400).json({ error: 'participantId ontbreekt.' });
    }

    const participant = await getParticipantById(MEETING_ID, participantId);
    if (!participant) {
      return res.status(404).json({ error: 'Deelnemer niet gevonden.' });
    }

    const result = await clearCheckIn({
      meetingId: MEETING_ID,
      participantId,
    });

    return res.json({
      ok: true,
      cleared: result.cleared,
      participantId,
    });
  } catch (err) {
    console.error('[admin/reset-checkin]', err);
    return res.status(500).json({ error: 'Resetten van check-in mislukt.' });
  }
}
