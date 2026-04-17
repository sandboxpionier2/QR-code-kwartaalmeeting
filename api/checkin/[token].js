import {
  getParticipantByToken,
  markCheckedIn,
  workshopName,
} from '../../lib/checkin.js';
import { MEETING_ID, WELCOME_INFO_TEXT } from '../../lib/config.js';

// POST /api/checkin/:token  → registreert (of herbevestigt) check-in
// GET  /api/checkin/:token  → geeft alleen de deelnemer-info terug
//                             (gebruikt door de welkomstpagina om de
//                             naam + workshop te tonen zonder al in te
//                             checken vóór POST slaagt)
export default async function handler(req, res) {
  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Token ontbreekt.' });
  }

  try {
    const participant = await getParticipantByToken(MEETING_ID, token);
    if (!participant) {
      return res.status(404).json({ error: 'Onbekende QR-code.' });
    }

    const payload = {
      participantId: participant.participantId,
      name: participant.name,
      assignedWorkshopId: participant.assignedWorkshopId,
      assignedWorkshopName: workshopName(participant.assignedWorkshopId),
      workshopInfo: participant.workshopInfo || '',
      welcomeInfoText: WELCOME_INFO_TEXT,
    };

    if (req.method === 'GET') {
      return res.json({
        ok: true,
        alreadyCheckedIn: !!participant.checkedInAt,
        checkedInAt: participant.checkedInAt ?? null,
        participant: payload,
      });
    }

    if (req.method === 'POST') {
      const result = await markCheckedIn({
        meetingId: MEETING_ID,
        participantId: participant.participantId,
        token,
      });
      return res.json({
        ok: true,
        alreadyCheckedIn: result.alreadyCheckedIn,
        checkedInAt: result.checkedInAt,
        participant: payload,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[checkin]', err);
    return res.status(500).json({ error: 'Er is iets misgegaan bij de check-in.' });
  }
}
