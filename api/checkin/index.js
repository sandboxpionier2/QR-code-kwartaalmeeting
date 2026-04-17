import {
  getParticipantById,
  getParticipantOptions,
  markCheckedIn,
  workshopName,
} from '../../lib/checkin.js';
import { MEETING_ID, WELCOME_INFO_TEXT } from '../../lib/config.js';

function participantPayload(participant) {
  return {
    participantId: participant.participantId,
    name: participant.name,
    assignedWorkshopId: participant.assignedWorkshopId,
    assignedWorkshopName: workshopName(participant.assignedWorkshopId),
    workshopInfo: participant.workshopInfo || '',
    welcomeInfoText: WELCOME_INFO_TEXT,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const participants = await getParticipantOptions(MEETING_ID);
      return res.json({
        ok: true,
        participants,
      });
    }

    if (req.method === 'POST') {
      const participantId = String(req.body?.participantId ?? '').trim();
      if (!participantId) {
        return res.status(400).json({ error: 'Kies je naam uit de lijst.' });
      }

      const participant = await getParticipantById(MEETING_ID, participantId);
      if (!participant) {
        return res.status(404).json({ error: 'Deelnemer niet gevonden.' });
      }

      const result = await markCheckedIn({
        meetingId: MEETING_ID,
        participantId,
        token: 'shared-qr',
      });

      return res.json({
        ok: true,
        alreadyCheckedIn: result.alreadyCheckedIn,
        checkedInAt: result.checkedInAt,
        participant: participantPayload(participant),
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[checkin/shared]', err);
    return res.status(500).json({ error: 'Er is iets misgegaan bij de check-in.' });
  }
}
