import { GoogleGenAI, FileState, createPartFromUri } from "@google/genai";

const MODEL = "gemini-2.5-flash";
const TRANSCRIPTION_PROMPT =
  "Transcribe the spoken audio from this recording verbatim. " +
  "Return plain text only: no timestamps, no speaker labels, no commentary, " +
  "no markdown. If the recording has no speech, return an empty string.";

let clientInstance: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (clientInstance) return clientInstance;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  clientInstance = new GoogleGenAI({ apiKey });
  return clientInstance;
}

async function waitForFileActive(
  ai: GoogleGenAI,
  fileName: string,
  { timeoutMs = 120_000, intervalMs = 2_000 }: { timeoutMs?: number; intervalMs?: number } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const file = await ai.files.get({ name: fileName });
    if (file.state === FileState.ACTIVE) return file;
    if (file.state === FileState.FAILED) {
      throw new Error(`Gemini file upload failed: ${file.error?.message ?? "unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for Gemini file to become ACTIVE");
}

export async function transcribeVideo(
  buffer: Buffer | Uint8Array,
  mimeType: string,
): Promise<string> {
  const ai = getClient();

  const blob = new Blob([buffer as unknown as ArrayBuffer], { type: mimeType });
  const uploaded = await ai.files.upload({
    file: blob,
    config: { mimeType },
  });

  if (!uploaded.name) {
    throw new Error("Gemini did not return a file name after upload");
  }

  const ready = await waitForFileActive(ai, uploaded.name);
  if (!ready.uri || !ready.mimeType) {
    throw new Error("Gemini file is ACTIVE but missing uri/mimeType");
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            createPartFromUri(ready.uri, ready.mimeType),
          ],
        },
      ],
    });
    return (response.text ?? "").trim();
  } finally {
    try {
      await ai.files.delete({ name: uploaded.name });
    } catch {
      // Non-fatal: Gemini auto-expires files after 48h.
    }
  }
}
