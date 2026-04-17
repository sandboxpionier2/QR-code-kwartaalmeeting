import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// qrcode is optioneel: als niet geïnstalleerd, serveren we een fallback
// SVG die de client nog steeds als QR kan renderen (via qr-print pagina).
let QRCode = null;
try {
  QRCode = (await import('qrcode')).default;
} catch {
  console.warn(
    '[checkin-app] `qrcode` npm pakket niet gevonden. ' +
      "Run `npm install` zodat QR-afbeeldingen server-side gerenderd kunnen worden."
  );
}

import {
  initDb,
  ensureTokensForAllParticipants,
  getAllParticipantsWithTokens,
  getParticipantByToken,
  markCheckedIn,
  getCheckinStats,
  getWorkshops,
  hasParticipantsTable,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 5000);
const MEETING_ID = process.env.MEETING_ID ?? 'default';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Kampen800';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
const WELCOME_INFO_TEXT =
  process.env.WELCOME_INFO_TEXT ??
  'Welkom bij de kwartaalmeeting! Kijk op de borden in de hal voor de zaalindeling.';

initDb();

if (!hasParticipantsTable()) {
  console.warn(
    '[checkin-app] Let op: de `participants` tabel is (nog) niet gevonden in de database. ' +
      'Start eerst de aanmeld-app en laat collega\'s zich inschrijven.'
  );
}

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true }));

// Publieke assets voor de welkomstpagina.
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// --- Kleine helpers ---
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAdminAuthorized(req) {
  const fromHeader = req.headers?.['x-admin-password'];
  if (typeof fromHeader === 'string' && fromHeader === ADMIN_PASSWORD) return true;
  const fromQuery = req.query?.password;
  if (typeof fromQuery === 'string' && fromQuery === ADMIN_PASSWORD) return true;
  return false;
}

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    meetingId: MEETING_ID,
    hasParticipantsTable: hasParticipantsTable(),
  });
});

// --- Check-in endpoint (wordt aangeroepen door de welkomstpagina) ---
app.post('/api/checkin/:token', (req, res) => {
  const { token } = req.params;
  const participant = getParticipantByToken(String(token));
  if (!participant) {
    return res.status(404).json({ error: 'Onbekende QR-code.' });
  }

  const alreadyCheckedIn = !!participant.checkedInAt;
  const checkedInAt = markCheckedIn({
    participantId: participant.participantId,
    meetingId: participant.meetingId,
  });

  res.json({
    ok: true,
    alreadyCheckedIn,
    checkedInAt,
    participant: {
      id: participant.participantId,
      name: participant.name,
      assignedWorkshopId: participant.assignedWorkshopId,
      assignedWorkshopName: participant.assignedWorkshopName,
    },
  });
});

// --- Welkomstpagina (wat collega's zien als ze hun QR scannen) ---
app.get('/checkin/:token', (req, res) => {
  const { token } = req.params;
  const participant = getParticipantByToken(String(token));

  if (!participant) {
    res.status(404).type('html').send(renderPage({
      title: 'QR-code niet herkend',
      bodyHtml: `
        <div class="card error">
          <div class="big-icon">⚠️</div>
          <h1>QR-code niet herkend</h1>
          <p>Dit ticket kon niet worden gevonden. Loop even langs de organisatie zodat we je kunnen helpen.</p>
        </div>
      `,
    }));
    return;
  }

  res.type('html').send(renderPage({
    title: `Welkom ${participant.name}`,
    bodyHtml: `
      <div class="card welcome" data-token="${escapeHtml(token)}">
        <div class="big-icon">👋</div>
        <p class="eyebrow">Welkom bij de kwartaalmeeting</p>
        <h1 id="welcome-name">${escapeHtml(participant.name)}</h1>

        <div class="workshop-block">
          <p class="eyebrow">Jouw workshop</p>
          <p class="workshop-name">${escapeHtml(participant.assignedWorkshopName ?? participant.assignedWorkshopId ?? 'Wordt nog bekend gemaakt')}</p>
        </div>

        <div class="info-block">
          <p>${escapeHtml(WELCOME_INFO_TEXT)}</p>
        </div>

        <div id="status" class="status pending">Bezig met inchecken…</div>
      </div>

      <script>
        (function () {
          var card = document.querySelector('.card.welcome');
          if (!card) return;
          var token = card.getAttribute('data-token');
          var statusEl = document.getElementById('status');

          fetch('/api/checkin/' + encodeURIComponent(token), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
            .then(function (res) {
              if (!res.ok) {
                statusEl.className = 'status error';
                statusEl.textContent = (res.body && res.body.error) || 'Check-in mislukt';
                return;
              }
              if (res.body.alreadyCheckedIn) {
                statusEl.className = 'status info';
                statusEl.textContent = '✓ Je was al ingecheckt. Veel plezier!';
              } else {
                statusEl.className = 'status success';
                statusEl.textContent = '✓ Succesvol ingecheckt. Veel plezier!';
              }
            })
            .catch(function () {
              statusEl.className = 'status error';
              statusEl.textContent = 'Check-in mislukt. Probeer opnieuw of meld je bij de organisatie.';
            });
        })();
      </script>
    `,
  }));
});

// --- QR-code beeldbestand per token (voor ingesloten images) ---
app.get('/qr/:token.png', async (req, res) => {
  if (!QRCode) {
    return res
      .status(503)
      .type('text/plain')
      .send('QR-afbeelding niet beschikbaar (run `npm install`).');
  }
  try {
    const { token } = req.params;
    const url = `${PUBLIC_URL}/checkin/${encodeURIComponent(token)}`;
    const buf = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).send('QR generatie mislukt');
  }
});

// --- Admin: token-generatie (wachtwoord vereist) ---
app.post('/api/admin/generate-tokens', (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: 'Onjuist wachtwoord.' });
  }
  const result = ensureTokensForAllParticipants({ meetingId: MEETING_ID });
  res.json({ ok: true, ...result });
});

// --- Admin: volledige deelnemerslijst (wachtwoord vereist) ---
app.get('/api/admin/participants', (req, res) => {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: 'Onjuist wachtwoord.' });
  }
  const stats = getCheckinStats({ meetingId: MEETING_ID });
  const participants = getAllParticipantsWithTokens({ meetingId: MEETING_ID }).map((p) => ({
    ...p,
    qrUrl: p.token ? `${PUBLIC_URL}/checkin/${encodeURIComponent(p.token)}` : null,
  }));
  res.json({
    ok: true,
    meetingId: MEETING_ID,
    publicUrl: PUBLIC_URL,
    stats,
    participants,
    workshops: getWorkshops(),
  });
});

// --- Admin dashboard & QR-print-pagina serveren ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/admin/qr', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'qr-print.html'));
});

// --- Root → korte info-pagina ---
app.get('/', (req, res) => {
  res.type('html').send(renderPage({
    title: 'Check-in app',
    bodyHtml: `
      <div class="card">
        <div class="big-icon">🎫</div>
        <h1>Kwartaalmeeting check-in</h1>
        <p>Dit is de check-in applicatie. Scan je persoonlijke QR-code om in te checken.</p>
        <p class="small"><a href="/admin">Organisatie dashboard →</a></p>
      </div>
    `,
  }));
});

// --- Simpele HTML wrapper voor welkomst/404 pagina's ---
function renderPage({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
  <main class="wrap">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`[checkin-app] listening on http://localhost:${PORT}`);
  console.log(`[checkin-app] public URL in QR codes: ${PUBLIC_URL}`);
});
