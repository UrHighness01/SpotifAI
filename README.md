# SpotifAI

A Spotify-style streaming platform built exclusively for AI-generated music. Users register, upload tracks they hold rights or generation rights to, organize them into albums, playlists, and their liked-songs library, and follow each other's artist profiles. There is no distributor or label layer — the uploader's profile **is** the artist.

The platform's core differentiator is **honest provenance**: every upload is fingerprinted, generator use is disclosed (or explicitly "not disclosed"), and a generator-signature corpus can independently confirm a track's origin.

## Platform model

- Users register and upload finished AI tracks (e.g. from Suno, Udio, or any source) directly into the shared catalog. No approval or distribution step.
- An **artist is the uploader's own profile**, not a separate signed act. Artist pages are customizable (name, bio, avatar, banner) and followable.
- Tracks carry AI-disclosure metadata: `aiModel` (optional — can be "not disclosed"), plus optional `aiPrompt` / `aiGenerationNotes`.
- Uploads can be single or **batch** (multiple files, one artist, optional shared album, per-file titles).

## Features

- **Auth**: register, email verification, login (JWT in httpOnly cookie), password reset — with dev-mode verification links when no SMTP is configured.
- **Catalog**: Home (greeting, Your artists, AI Artists, Trending, Made For You, follow feed, Signature-confirmed, Verifiably honest, Recent), Search (text + "Made with" facets incl. "Not disclosed"), Browse-all (whole catalog + search + facets), per-generator "Made with" pages.
- **Library**: like/unlike (hearts everywhere — rows, cards, player), multi-select with Ctrl/Shift+click, create a playlist directly from a selection.
- **Playlists**: full CRUD, bulk create with initial tracks, per-track covers.
- **Follows**: follow any artist (including your own), sidebar "Following" list, new-drop feed on Home.
- **Player**: streaming with seek + volume, now-playing provenance badge, prompt echo, nano mood/energy tags.
- **Artists**: follow button, payout link (Ko-fi/Stripe/PayPal/BTC), customize page (name/bio/avatar/banner), owner view vs fan view.
- **Provenance**: SHA-256 byte fingerprints + windowed perceptual hashes recorded at upload, Ed25519-signed exportable manifests, generator-signature corpus with ≥90% leave-one-out cross-validation gates, live provenance labels (recorded → signature-uncertain → signature-matched), attestations.

## Stack

- **API**: Node.js, Express, TypeScript, Prisma ORM, SQLite
- **Web**: React, Vite, TypeScript, React Router, Zustand
- **Desktop**: Electron, wrapping the web build in a sandboxed `BrowserWindow`; embeds the **nano** on-device model
- **Nano**: a tiny on-device INT4 model (`apps/desktop/nano/track-describer.bin`, ~400 KB) that generates track blurbs and deterministic mood/energy tags **locally** — no network, no API, free. The desktop app spawns a C engine (`track_describer`) that runs the model; the web app degrades gracefully when it's absent.
- **Storage**: local filesystem (`storage/audio`, `covers`, `avatars`, `banners`), served through an HTTP Range-request streaming endpoint for seeking
- **Monorepo**: npm workspaces (`apps/api`, `apps/web`, `apps/desktop`, `packages/types`)

## Repository layout

```
apps/
  api/             Express API, Prisma schema + migrations, corpus scripts
  web/             React + Vite frontend
  desktop/         Electron shell + nano on-device model (C engine, worker)
packages/
  types/           TypeScript types shared between api and web
storage/           Uploaded audio, covers, avatars, banners (gitignored)
```

## Data model

`User`, `Artist`, `Album`, `Track`, `Playlist` / `PlaylistTrack`, `LibrarySave` (liked songs), `Follow`, `Attestation`, `CollabRequest`. See `apps/api/prisma/schema.prisma` for the full schema. Playlist CRUD is fully implemented (including cascade delete).

## Provenance & honesty

- At upload, each track gets a **byte fingerprint** (SHA-256) and a **windowed perceptual hash**, stored immutably alongside a `provenanceStatus`.
- A **generator-signature corpus** (`apps/prisma/corpus/`, gitignored; pinned snapshots committed under `snapshots/`) holds curated per-generator fingerprints. Cross-validation requires ≥90% leave-one-out accuracy per generator before a gate passes.
- New uploads are **evaluated live**: `recorded` → `signature-uncertain` (overlap) → `signature-matched` (independently confirmed).
- Anyone can download an artist's **Ed25519-signed provenance manifest** and verify hashes offline against their own audio copy.

## Nano on-device model

The desktop app embeds a tiny language model (~400 KB INT4 GLA) that:

- generates a short "what this is" **blurb** for the current track (desktop only, skipped when the generator wasn't disclosed),
- computes deterministic **mood/energy tags** offline.

Everything runs locally in a C engine — no data leaves the machine, no API key, no cost. The web app works fine without it.

## Getting started

Requirements: Node.js 20+, npm.

```bash
npm install
npm run build -w packages/types
```

Copy the API environment file and adjust as needed:

```bash
cp apps/api/.env.example apps/api/.env
```

Run the database migrations and, optionally, seed placeholder data:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run seed
```

Start the API and web app together:

```bash
npm run dev
```

The API listens on `http://localhost:4000`, the web app on `http://localhost:5173`.

### Desktop app

```bash
npm run dev:desktop
```

Starts the API + web dev servers, waits for the web server, then opens an Electron window pointed at it. Package a desktop build with `npm run build -w apps/desktop`.

## API overview

| Route | Description |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Account + session (JWT in httpOnly cookie) |
| `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password` | Email verification + password reset |
| `GET /artists`, `GET /artists/mine`, `GET/POST /artists/:id/...` | Artist catalog, my artists, profile/bio/avatar/banner/payout edits (owner-only) |
| `GET/POST /albums`, `GET /albums/:id`, `PATCH /albums/:id/cover` | Albums + cover upload |
| `GET /tracks`, `GET /tracks/:id`, `PATCH /tracks/:id/meta` | Track catalog (search/facets/fingerprint filters), meta (prompt/rights/license/remix) |
| `GET /tracks/:id/related`, `GET /tracks/recommended` | Co-occurrence recommendations |
| `GET /tracks/:id/similar` | Perceptual-hash similarity |
| `POST /tracks/:id/attest`, `GET /tracks/:id/attestations` | Provenance attestation |
| `POST /upload/track`, `POST /upload/tracks` | Single + batch upload (fingerprinted, provenance-evaluated) |
| `GET /stream/:trackId` | Range-request streaming + play counting |
| `GET/POST/DELETE /library` | Liked songs |
| `GET/POST/DELETE /playlists` + `/playlists/:id/tracks` | Playlists (bulk-create with initial tracks) |
| `POST/DELETE/GET /follows` + `/follows/feed` | Following + new-drop feed |
| `GET /corpus` | Generator-signature corpus status |
| `GET /artists/:id/provenance-manifest`, `GET /artists/provenance-public-key` | Signed provenance manifests |

## Security notes

- Passwords hashed with bcrypt; sessions are JWTs in httpOnly cookies (sameSite strict, `secure` in production).
- Uploads validated by mimetype allowlist and capped in size; filenames server-generated, never client-supplied.
- Audio streams only via the rate-limited, play-counting `/stream` route; covers/avatars/banners are public static.
- Rate limiting: auth brute-force limit (IP-keyed), write limit (per-user, writes only), upload + mail limits. IPv6-normalized keys.
- `helmet` for security headers; CORS locked to configured origins (any localhost port in dev for the vite port-bounce case).
- `JWT_SECRET` and the Ed25519 manifest keys must be overridden from dev defaults in production — the API **refuses to start** otherwise.
- Payout handles must be http(s) and host-validated per kind (anti-phishing).
- Run `npm audit` before deploying.

## Status

Early-stage but actively developed. Treat as pre-production.
