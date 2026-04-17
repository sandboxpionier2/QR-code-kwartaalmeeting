import { isAdminAuthorized, unauthorized } from '../../lib/auth.js';
import {
  getAdminOverview,
  computeStats,
  workshopName,
  WORKSHOPS,
} from '../../lib/checkin.js';
import { MEETING_ID } from '../../lib/config.js';
import { getPublicUrl } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdminAuthorized(req)) return unauthorized(res);

  try {
    const overview = await getAdminOverview(MEETING_ID);
    const stats = computeStats(overview);
    const publicUrl = getPublicUrl();

    const participants = overview.map((p) => ({
      ...p,
      assignedWorkshopName: workshopName(p.assignedWorkshopId),
      qrUrl: p.token ? `${publicUrl}/checkin/${encodeURIComponent(p.token)}` : null,
    }));

    res.json({
      ok: true,
      meetingId: MEETING_ID,
      publicUrl,
      workshops: WORKSHOPS,
      stats,
      participants,
    });
  } catch (err) {
    console.error('[admin/participants]', err);
    res.status(500).json({ error: 'Ophalen van dashboard mislukt.' });
  }
}
