# SpotifAI

A Spotify-style streaming platform built exclusively for AI-generated music. Users register, upload tracks they hold rights or generation rights to, and organize them into albums and their own library. There is no distributor or label layer in between — the uploader's profile is the artist.

## Platform model

- Users register, then upload tracks directly into the shared catalog. There is no approval, distribution, or licensing step in between.
- An "artist" is the uploader's own profile, not a separate signed act.
- There is no generation pipeline in this app. Tracks arrive already made (e.g. from Suno, Udio, or any other source) and are uploaded as finished audio files, the same way Spotify accepts finished audio from a distributor.
- Each track carries AI-disclosure metadata (`aiModel`, and optionally `aiPrompt` / `aiGenerationNotes`) rather than hiding its origin.

## Stack

- **API**: Node.js, Express, TypeScript, Prisma ORM, SQLite
- **Web**: React, Vite, TypeScript, React Router, Zustand
- **Desktop**: Electron, wrapping the web build in a sandboxed `BrowserWindow`
- **Storage**: local filesystem (`storage/audio`, `storage/covers`), served through an HTTP Range-request streaming endpoint for seeking
- **Monorepo**: npm workspaces (`apps/api`, `apps/web`, `apps/desktop`, `packages/types`)

## Repository layout

```
apps/
  api/       Express API, Prisma schema and migrations, seed script
  web/       React + Vite frontend
  desktop/   Electron shell that loads the web app
packages/
  types/     TypeScript types shared between api and web
storage/     Uploaded audio and cover art (gitignored)
```

## Data model

`User`, `Artist`, `Album`, `Track`, `Playlist` / `PlaylistTrack`, and `LibrarySave` (the "saved to library" analog of liked songs). See `apps/api/prisma/schema.prisma` for the full schema.

Playlist and album data models exist in the schema; playlist CRUD routes are not implemented yet.

## Getting started

Requirements: Node.js 20+, npm.

```bash
npm install
```

Copy the API environment file and adjust as needed:

```bash
cp apps/api/.env.example apps/api/.env
```

Run the database migrations and, optionally, seed some placeholder data:

```bash
npm run build -w packages/types
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
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

This starts the API and web dev servers, waits for the web server to be reachable, then opens an Electron window pointed at it. To package a desktop build:

```bash
npm run build -w apps/desktop
```

## API overview

| Route | Description |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Account creation and session management (JWT in an httpOnly cookie) |
| `GET/POST /artists`, `GET /artists/:id` | Artist catalog; writes require authentication |
| `GET/POST /albums`, `GET /albums/:id` | Album catalog; writes require authentication |
| `GET /tracks/:id` | Track lookup |
| `GET /tracks/:id/related` | Co-occurrence recommendations — tracks that appear alongside this one in users' libraries/playlists, ranked by merged weight (library ×2, playlist ×1); cold-start fallback (same artist → same `aiModel` → trending) |
| `GET /tracks/recommended` | Personalized recommendations for the current user (taste-based co-occurrence off their library/playlists); anonymous callers get a trending fallback |
| `POST /upload/track` | Uploads an audio file (and optional cover) and creates the track record; requires authentication |
| `GET /stream/:trackId` | Streams a track with HTTP Range support for seeking |
| `GET/POST/DELETE /library` | Save, list, and remove tracks from the current user's library |

## Security notes

- Passwords are hashed with bcrypt; sessions use a JWT stored in an httpOnly cookie.
- Uploads are validated by mimetype (audio and image allowlists) and capped in size (`fileSize` 200 MB, `fieldSize` 32 KB); filenames are server-generated, not taken from client input.
- Cover/avatar art is served publicly from `/media/covers` and `/media/avatars` (a shared catalog — covers aren't secret); audio stays behind the rate-limited, play-counting `/stream` route.
- `helmet` is applied for standard security headers, and `/auth` routes are rate-limited.
- `JWT_SECRET` must be overridden from its development default before running with `NODE_ENV=production`; the API refuses to start otherwise.
- `CORS_ORIGIN` and the session cookie's `secure` flag are configurable per environment; the cookie is only marked `secure` in production.

Run `npm audit` before deploying. As of the last audit, the only outstanding runtime-relevant finding is a moderate `react-router` advisory that requires a major-version migration to resolve; the remaining high/critical findings are in `electron-builder`'s build-time packaging toolchain and are not part of the shipped application.

## Status

This is a private, early-stage project. It has not been reviewed for production deployment beyond the hardening steps listed above.
