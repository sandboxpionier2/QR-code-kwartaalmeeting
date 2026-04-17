// Eenvoudige wachtwoordcheck voor de admin endpoints. Gebruikt het
// ADMIN_PASSWORD env var; valt terug op 'Kampen800' (zelfde default
// als de aanmeld-app's EXPORT_PASSWORD) zodat lokaal testen makkelijk is.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Kampen800';

export function isAdminAuthorized(req) {
  const fromHeader = req.headers?.['x-admin-password'];
  if (typeof fromHeader === 'string' && fromHeader === ADMIN_PASSWORD) return true;
  if (Array.isArray(fromHeader) && fromHeader[0] === ADMIN_PASSWORD) return true;
  const fromQuery = req.query?.password;
  if (typeof fromQuery === 'string' && fromQuery === ADMIN_PASSWORD) return true;
  return false;
}

export function unauthorized(res) {
  return res.status(401).json({ error: 'Onjuist wachtwoord.' });
}
