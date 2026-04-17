import { isAdminAuthorized, unauthorized } from '../../lib/auth.js';
import { ensureTokensForAllParticipants } from '../../lib/checkin.js';
import { MEETING_ID } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdminAuthorized(req)) return unauthorized(res);

  try {
    const result = await ensureTokensForAllParticipants(MEETING_ID);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin/generate-tokens]', err);
    res.status(500).json({ error: 'Token generatie mislukt.' });
  }
}
