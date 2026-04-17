# Check-in app — Kwartaalmeeting (Vercel + Firestore)

Losstaande QR-code check-in applicatie voor op de dag van de kwartaalmeeting. Draait op **Vercel** en deelt **Firestore** met de aanmeld-app (`Uitnodiging-kwartaalmeeting/`). De bestaande `participants`- en `meetingStats`-collecties worden niet aangeraakt — deze app schrijft alleen naar twee nieuwe sub-collecties.

## Hoe het werkt

- Elke deelnemer uit de aanmeld-app krijgt een uniek, niet-raden token.
- Een persoonlijke QR-code wijst naar `PUBLIC_URL/checkin/<token>`.
- Bij scannen wordt de deelnemer automatisch ingecheckt en ziet hij/zij een welkomstscherm met z'n naam en de toegewezen workshop.
- Een admin-dashboard op `/admin` (wachtwoord) toont live wie al binnen is, per workshop.
- Een printbare pagina op `/admin/qr` zet alle QR-codes op A4 om uit te delen of als PDF op te slaan.

## Firestore schema

Alleen-lezen (van de aanmeld-app):

```
meetings/{meetingId}/participants/{participantId}    — aanmeldingen
meetingStats/{meetingId}                             — capaciteitstellers
```

Nieuw, geschreven door deze app:

```
meetings/{meetingId}/checkinTokens/{token}           — { participantId, createdAt }
meetings/{meetingId}/checkins/{participantId}        — { token, checkedInAt }
```

`token` is de doc-id in `checkinTokens`, dus opzoeken op token kost één doc-read. `participantId` is de doc-id in `checkins`, dus dubbele check-ins zijn automatisch geen-op (de eerste `set` wint, de tweede detecteren we en geven we `alreadyCheckedIn: true` terug).

## Projectstructuur

De Vercel-app staat in de **repository-root** (`api/`, `public/`, `vercel.json`), zodat Vercel geen aparte submap als root hoeft te hebben.

```
./
├── api/
│   ├── health.js
│   ├── checkin/[token].js         # GET (info) / POST (check-in)
│   ├── admin/participants.js      # GET lijst + stats (password)
│   ├── admin/generate-tokens.js   # POST maak tokens aan (password)
│   └── qr/[token].js              # PNG QR-afbeelding
├── lib/
│   ├── firestore.js               # Firebase admin init
│   ├── checkin.js                 # Business logic (tokens, check-in, stats)
│   ├── auth.js                    # Admin-wachtwoord check
│   └── config.js                  # Env → runtime config
├── public/
│   ├── index.html                 # Info-pagina
│   ├── checkin.html               # Welkomstscherm (via QR)
│   ├── admin.html                 # Dashboard
│   ├── qr-print.html              # Printbare QR-pagina
│   └── styles.css
├── vercel.json                    # Rewrites voor mooie URLs
├── package.json
├── .env.example
├── .gitignore
└── duck-demo/                     # losstaande React-demo (niet de productie-build)
```

## Deployment naar Vercel

### 1) Repo pushen

Push deze repo naar GitHub (zie instructies onderaan).

### 2) Nieuwe Vercel project aanmaken

- Ga naar [vercel.com/new](https://vercel.com/new) en importeer de repo.
- Laat **Root Directory** leeg (repository root), of zet hem expliciet op `.`.
- Had je eerder **Root Directory** op `checkin-app` staan: wijzig die naar de root en **Redeploy** (anders blijft Vercel een lege map bouwen → 404).
- Framework preset: **Other** (Vercel detecteert `vercel.json` en de `api/`-map automatisch).

### 3) Environment variables instellen

Kopieer deze uit het aanmeld-app project in Vercel (zelfde waarden — dan wijzen beide apps naar dezelfde Firestore):

| Variable | Toelichting |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Zelfde als bij aanmeld-app |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | (aanbevolen) volledige service account JSON als één env var |
| of `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | alternatief |
| `MEETING_ID` | `default` (of wat je in de aanmeld-app gebruikt) |
| `ADMIN_PASSWORD` | Wachtwoord voor `/admin` |
| `WELCOME_INFO_TEXT` | Algemene tekst op het welkomstscherm |
| `PUBLIC_URL` | *(optioneel)* custom domain; valt anders terug op Vercel's URL |

### 4) Deploy

Klik **Deploy**. Vercel bouwt en host de app.

### 5) Voorbereiden op de dag zelf

1. Open `https://<je-app>.vercel.app/admin` en log in.
2. Klik **"Genereer ontbrekende QR-tokens"** — maakt per deelnemer een token aan (idempotent).
3. Klik **"QR-printpagina openen"** en print of sla op als PDF.
4. Verspreid de QR-codes (uitprinten + uitdelen, of digitaal mailen).
5. Zorg dat je dashboard open hebt staan op de dag — het ververst zichzelf elke 15 seconden.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local    # en vul de waarden in
npx vercel dev                # vereist Vercel CLI (npm i -g vercel)
```

`vercel dev` draait de app inclusief rewrites op `http://localhost:3000`.

## Endpoints

| Route | Methode | Doel |
| --- | --- | --- |
| `/checkin/:token` | GET (HTML) | Welkomstscherm (rewrite naar `checkin.html`) |
| `/api/checkin/:token` | POST | Registreert check-in, geeft deelnemer-info terug |
| `/api/checkin/:token` | GET | Alleen info, nog niet inchecken |
| `/api/qr/:token` | GET | PNG QR-afbeelding voor die token |
| `/admin` | GET (HTML) | Dashboard (rewrite naar `admin.html`) |
| `/admin/qr` | GET (HTML) | Print-pagina (rewrite naar `qr-print.html`) |
| `/api/admin/participants` | GET | Dashboard-data (wachtwoord) |
| `/api/admin/generate-tokens` | POST | Tokens aanmaken voor deelnemers zonder (wachtwoord) |
| `/api/health` | GET | Healthcheck |

Admin-endpoints verwachten `x-admin-password` header of `?password=` in de query.

## Veiligheid

- Tokens zijn 96-bit random, base64url-encoded, dus niet brute-force-baar.
- De check-in endpoint is bewust publiek (een deelnemer logt nergens in — de QR is het ticket).
- Admin endpoints zijn beveiligd met een gedeeld wachtwoord. Overweeg dit na de meeting te roteren.
- Deze app wijzigt nooit de `participants`-docs of `meetingStats`-counters van de aanmeld-app.
