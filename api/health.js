import { isFirestoreEnabled } from '../lib/firestore.js';
import { MEETING_ID } from '../lib/config.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.json({
    ok: true,
    meetingId: MEETING_ID,
    firestoreEnabled: isFirestoreEnabled(),
  });
}
