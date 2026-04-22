# Lune — Video Analysis

Next.js 16 + Firebase Auth + Supabase Storage/DB + Google Gemini.
Signed-in users record up to 5-minute videos from the browser, upload to
Supabase Storage, then a server route transcribes via Gemini and saves both
the transcript file and metadata in Supabase.

## Stack

- **Next.js 16** App Router with React 19 and TypeScript.
- **Firebase** — Auth only (Google sign-in + ID token verification).
- **Supabase** — Postgres (`videos` table) + Storage bucket (`recordings`).
- **Google Gemini** via `@google/genai` using the Files API and
  `gemini-2.5-flash`.

## Setup

### 1. Firebase project (Auth only)

In the [Firebase console](https://console.firebase.google.com/):

1. Create or pick a project.
2. **Authentication → Sign-in method → Google**: enable it.
3. **Project settings → General → Your apps → Web**: register a web app and
   copy config values (`apiKey`, `authDomain`, `projectId`, `appId`).
4. **Project settings → Service accounts → Generate new private key**:
   download the JSON. You'll paste `project_id`, `client_email`, and
   `private_key` from it into `.env.local`.

### 2. Supabase project (Storage + DB)

1. Create a project in [Supabase](https://supabase.com/dashboard).
2. In **Project settings → API**, copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key
3. In **Storage**, create a bucket named `recordings` (or set a different
   name in `SUPABASE_STORAGE_BUCKET`).
4. In **SQL editor**, run:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  uid text not null,
  email text,
  storage_path text not null,
  transcript_path text,
  transcript text,
  mime_type text,
  status text not null default 'uploading',
  duration_ms bigint,
  size_bytes bigint,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_created_at_idx on public.videos (created_at desc);
create index if not exists videos_uid_idx on public.videos (uid);
```

### 3. Gemini API key

Create an API key at <https://aistudio.google.com/apikey>.

### 4. Environment variables

Copy `.env.local.example` to `.env.local` and fill in every value:

```bash
cp .env.local.example .env.local
```

- `NEXT_PUBLIC_FIREBASE_*` come from the Firebase web app config in step 1.3.
- `FIREBASE_ADMIN_*` come from the service-account JSON in step 1.4. When
  pasting `FIREBASE_ADMIN_PRIVATE_KEY`, keep the literal `\n` sequences — the
  server converts them to real newlines at runtime.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` come from step 2.
- `GEMINI_API_KEY` is the key from step 3.
- `ADMIN_EMAILS` is a comma-separated list of Google-account emails that
  should have access to `/admin`.

### 5. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, sign in with Google, and record a video. If your
email is in `ADMIN_EMAILS`, you'll see the **Admin** link in the header.

## How it works

1. `Recorder` component uses `MediaRecorder` to capture a webm (or mp4 on
   Safari) clip. A 5-minute timer auto-stops recording.
2. On upload, the browser calls `POST /api/videos` (with Firebase ID token).
   The server inserts a `videos` row in Supabase and returns a signed upload
   token for `videos/{uid}/{id}.webm`.
3. The browser uploads the blob directly to Supabase Storage with
   `uploadToSignedUrl`.
4. The browser calls `POST /api/videos/{id}/complete` then
   `POST /api/videos/{id}/transcribe`.
5. The transcribe route downloads from Supabase Storage, uploads to Gemini
   Files API, waits until it's `ACTIVE`, and asks
   `gemini-2.5-flash` to transcribe the audio. The plain-text transcript is
   written to `transcripts/{uid}/{id}.txt` in Supabase Storage and duplicated
   on the `videos` row for quick rendering.
6. Admin can trigger rubric scoring (`POST /api/videos/{id}/score`). Gemini
   analyzes the video + transcript and writes `score`, `rubric_breakdown`, and
   `score_feedback` to the `videos` row.
7. `/admin` (gated by the `ADMIN_EMAILS` allowlist and a
   Firebase session cookie) lists every recording; `/admin/{id}` streams the
   video, renders transcript, and shows scoring results.

## Data model

Supabase `public.videos`:

- `uid`, `email`
- `storage_path` (`videos/{uid}/{id}.webm`)
- `transcript_path` (`transcripts/{uid}/{id}.txt`)
- `transcript` (string, duplicated for fast admin rendering)
- `status` — `uploading` | `transcribing` | `ready` | `failed`
- `duration_ms`, `size_bytes`, `mime_type`
- `score`, `rubric_breakdown`, `score_feedback`, `score_model`, `scored_at`
- `error`, `created_at`, `updated_at`

## Next up — rubric scoring

The transcript is already on the `videos` row, so rubric scoring is a
drop-in addition:

- Add `POST /api/videos/{id}/score` that reads `transcript`, calls Gemini with
  a rubric-shaped JSON schema, and writes `score` + `rubricBreakdown` back to
  the same document.
- Admin detail page renders the breakdown alongside the transcript.
