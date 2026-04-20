import crypto from 'node:crypto';
import { CHECKIN_RESET_SECRET } from './config.js';

const TTL_MS = 2 * 60 * 1000;

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', CHECKIN_RESET_SECRET)
    .update(payloadB64)
    .digest('base64url');
}

export function createCheckinResetToken(participantId) {
  const now = Date.now();
  const payload = {
    participantId,
    expiresAt: now + TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyCheckinResetToken(token, participantId) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, providedSignature] = token.split('.', 2);
  if (!payloadB64 || !providedSignature) return false;

  const expectedSignature = sign(payloadB64);
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return false;

  try {
    const payloadRaw = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadRaw);
    if (payload?.participantId !== participantId) return false;
    if (typeof payload?.expiresAt !== 'number') return false;
    return payload.expiresAt >= Date.now();
  } catch {
    return false;
  }
}
