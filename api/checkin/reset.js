import { clearCheckIn, getParticipantById } from '../../lib/checkin.js';
import { verifyCheckinResetToken } from '../../lib/checkin-reset-token.js';
import { MEETING_ID } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const participantId = String(req.body?.participantId ?? '').trim();
    const resetToken = String(req.body?.resetToken ?? '').trim();
    if (!participantId || !resetToken) {
      return res.status(400).json({ error: 'Resetgegevens ontbreken.' });
    }

    if (!verifyCheckinResetToken(resetToken, participantId)) {
      return res.status(401).json({ error: 'Reset verlopen of ongeldig.' });
    }

    const participant = await getParticipantById(MEETING_ID, participantId);
    if (!participant) {
      return res.status(404).json({ error: 'Deelnemer niet gevonden.' });
    }

    const result = await clearCheckIn({ meetingId: MEETING_ID, participantId });
    return res.json({
      ok: true,
      cleared: result.cleared,
    });
  } catch (err) {
    console.error('[checkin/reset]', err);
    return res.status(500).json({ error: 'Resetten is mislukt. Probeer opnieuw.' });
  }
}
