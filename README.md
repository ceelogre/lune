# Lune — Video Analysis

Next.js 16 + Firebase + Google Gemini. Signed-in users record up to 5-minute
videos from the browser, the recording is uploaded to Firebase Storage, a
server route transcribes it with Gemini 2.5 Flash, and an admin panel shows
every recording with its transcript.

## Stack

- **Next.js 16** App Router with React 19 and TypeScript.
- **Firebase** — Auth (Google sign-in), Firestore (video metadata), Storage
  (video files + transcripts).
- **Google Gemini** via `@google/genai` using the Files API and
  `gemini-2.5-flash`.

## Setup

### 1. Firebase project

In the [Firebase console](https://console.firebase.google.com/):

1. Create or pick a project.
2. **Authentication → Sign-in method → Google**: enable it.
3. **Firestore Database**: create a database in Native mode.
4. **Storage**: create the default bucket.
5. **Project settings → General → Your apps → Web**: register a web app and
   copy the config values (apiKey, authDomain, projectId, storageBucket,
   appId).
6. **Project settings → Service accounts → Generate new private key**:
   download the JSON. You'll paste `project_id`, `client_email`, and
   `private_key` from it into `.env.local`.

### 2. Gemini API key

Create an API key at <https://aistudio.google.com/apikey>.

### 3. Environment variables

Copy `.env.local.example` to `.env.local` and fill in every value:

```bash
cp .env.local.example .env.local
```

- `NEXT_PUBLIC_FIREBASE_*` come from the web app config in step 1.5.
- `FIREBASE_ADMIN_*` come from the service-account JSON in step 1.6. When
  pasting `FIREBASE_ADMIN_PRIVATE_KEY`, keep the literal `\n` sequences — the
  server converts them to real newlines at runtime.
- `GEMINI_API_KEY` is the key from step 2.
- `ADMIN_EMAILS` is a comma-separated list of Google-account emails that
  should have access to `/admin`.

### 4. Deploy security rules

The project ships `firestore.rules` and `storage.rules`. Deploy them with the
Firebase CLI (`npm i -g firebase-tools && firebase login`):

```bash
firebase deploy --only firestore:rules,storage
```

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
2. On upload, the browser calls `POST /api/videos` (sending its Firebase ID
   token as a bearer) which creates a `videos/{id}` Firestore document and
   returns the Storage path `videos/{uid}/{id}.webm`.
3. The browser uploads the blob directly to Storage via
   `uploadBytesResumable` with a progress bar.
4. The browser calls `POST /api/videos/{id}/complete` then
   `POST /api/videos/{id}/transcribe`.
5. The transcribe route downloads the file via the Admin SDK, uploads it to
   the Gemini Files API, waits until it's `ACTIVE`, and asks
   `gemini-2.5-flash` to transcribe the audio. The plain-text transcript is
   written to `transcripts/{uid}/{id}.txt` **and** stored on the Firestore
   document for quick display.
6. `/admin` (gated by the `ADMIN_EMAILS` allowlist and a
   Firebase session cookie) lists every recording; `/admin/{id}` streams the
   video from a signed URL and renders the transcript.

## Data model

Firestore `videos/{id}`:

- `uid`, `email`
- `storagePath` (`videos/{uid}/{id}.webm`)
- `transcriptPath` (`transcripts/{uid}/{id}.txt`)
- `transcript` (string, duplicated for fast admin rendering)
- `status` — `uploading` | `transcribing` | `ready` | `failed`
- `durationMs`, `sizeBytes`, `mimeType`
- `error`, `createdAt`, `updatedAt`

## Next up — rubric scoring

The transcript is already on the Firestore document, so rubric scoring is a
drop-in addition:

- Add `POST /api/videos/{id}/score` that reads `transcript`, calls Gemini with
  a rubric-shaped JSON schema, and writes `score` + `rubricBreakdown` back to
  the same document.
- Admin detail page renders the breakdown alongside the transcript.
