# Check-in app — Kwartaalmeeting

Een kleine, losstaande applicatie die bovenop de bestaande aanmeld-app
(`../Uitnodiging-kwartaalmeeting`) draait. Deelnemers scannen op de dag
zelf hun persoonlijke QR-code, waarna ze automatisch worden ingecheckt
in de database en een welkomstscherm met hun toegewezen workshop te
zien krijgen.

De code van de aanmeld-app wordt niet aangepast. Deze app leest
rechtstreeks dezelfde SQLite-database en voegt daar twee eigen tabellen
aan toe: `participant_tokens` en `checkins`.

## Wat het doet

- Genereert per bestaande deelnemer een uniek check-in token (korte,
  niet-rade URL-string).
- Maakt per token een QR-code aan die naar een welkomstpagina linkt.
- Op die welkomstpagina wordt de deelnemer automatisch ingecheckt en
  ziet hij/zij:
  - z'n naam
  - de toegewezen workshop (uit de aanmelding)
  - de algemene info-tekst (via `WELCOME_INFO_TEXT`)
- Een met wachtwoord beveiligd admin dashboard (`/admin`) toont live
  welke deelnemers al binnen zijn, met filters per workshop en status.
- Een printbare pagina (`/admin/qr`) zet alle QR-codes op A4 zodat ze
  uitgeprint of gedownload kunnen worden.

## Installatie

```bash
cd checkin-app
npm install
cp .env.example .env.local   # en pas de waarden aan
```

Belangrijk in `.env.local`:

- `DB_PATH` — pad naar `workshops.sqlite` van de aanmeld-app.
- `PUBLIC_URL` — de URL waar deze check-in app op de dag bereikbaar is.
  Deze waarde wordt in de QR-codes gezet. Gebruik bijv. een intern
  IP-adres (`http://192.168.1.42:5000`), een tunnel (ngrok) of een
  gedeployde URL.
- `ADMIN_PASSWORD` — wachtwoord voor het dashboard.
- `WELCOME_INFO_TEXT` — algemene tekst die elke deelnemer op het
  welkomstscherm te zien krijgt.

## Starten

```bash
npm start
```

De server luistert op `http://localhost:5000` (poort aanpasbaar via
`PORT`).

## Voorbereiden van een meeting

1. Zorg dat de aanmeld-app zijn werk heeft gedaan (collega's zijn
   ingeschreven en hebben een workshop toegewezen gekregen).
2. Start de check-in app.
3. Open `http://localhost:5000/admin` en log in.
4. Klik op **"Genereer ontbrekende QR-tokens"**. Dit maakt per deelnemer
   een token aan (idempotent; bestaande tokens blijven hetzelfde).
5. Klik op **"QR-printpagina openen"**, controleer de lijst en print of
   sla de pagina op als PDF.
6. Verspreid de QR-codes (print + uitdelen, of knip ze uit en mail ze).

## Op de dag zelf

- Zorg dat de check-in app draait op een URL die vanaf de telefoons van
  collega's bereikbaar is (zelfde WiFi / via tunnel / gedeployed).
- Houd het admin dashboard op `/admin` open — deze ververst automatisch
  iedere 15 seconden.
- Collega's scannen hun QR, zien een welkomstscherm en zijn direct
  ingecheckt.

## Endpoints (samenvatting)

- `GET  /checkin/:token`          — publieke welkomstpagina (via QR)
- `POST /api/checkin/:token`      — registreert de daadwerkelijke check-in
- `GET  /qr/:token.png`           — QR-afbeelding per deelnemer
- `GET  /admin`                   — dashboard (wachtwoord vereist)
- `GET  /admin/qr`                — printbare pagina met alle QR-codes
- `GET  /api/admin/participants`  — JSON met deelnemers + check-in status
- `POST /api/admin/generate-tokens` — maakt tokens aan voor nieuwe deelnemers
- `GET  /api/health`              — healthcheck

Admin-endpoints verwachten de header `x-admin-password` of
`?password=` in de URL.

## Database

De app voegt deze tabellen toe aan `workshops.sqlite`:

```sql
CREATE TABLE IF NOT EXISTS participant_tokens (
  token TEXT PRIMARY KEY,
  participant_id INTEGER NOT NULL UNIQUE,
  meeting_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL UNIQUE,
  meeting_id TEXT NOT NULL,
  checked_in_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

De bestaande `participants`-tabel wordt nooit gewijzigd.
