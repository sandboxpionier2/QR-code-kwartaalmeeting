import QRCode from 'qrcode';
import { getPublicUrl } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const size = Math.max(64, Math.min(1024, Number(req.query?.size) || 320));
  const url = `${getPublicUrl()}/checkin`;

  try {
    const buf = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.status(200).send(buf);
  } catch (err) {
    console.error('[qr/shared]', err);
    res.status(500).send('QR generatie mislukt');
  }
}
