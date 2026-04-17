// Centrale config-punt, leest Vercel environment variables.
export const MEETING_ID = process.env.MEETING_ID ?? 'default';

export const WELCOME_INFO_TEXT =
  process.env.WELCOME_INFO_TEXT ??
  'Welkom bij de kwartaalmeeting! Kijk op de borden in de hal voor de zaalindeling.';

// PUBLIC_URL is de URL waarop deze app bereikbaar is (voor in de QR-codes).
// Op Vercel zetten we deze via de Environment Variables UI. Als de
// var niet gezet is, vallen we terug op VERCEL_URL (standaard door
// Vercel geleverd) met https-schema.
export function getPublicUrl() {
  if (process.env.PUBLIC_URL) return String(process.env.PUBLIC_URL).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
