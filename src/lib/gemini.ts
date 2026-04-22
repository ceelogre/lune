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

export type RubricCriterion = {
  name: string;
  score: number;
  reason: string;
};

export type VideoScoreResult = {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  criteria: RubricCriterion[];
};

function buildScoringPrompt(transcript?: string | null): string {
  const transcriptSection = transcript
    ? `Transcript (optional context):\n${transcript}\n\n`
    : "";

  return (
    "You are evaluating a candidate's recorded spoken response. " +
    "Score it using this rubric with a 0-100 overall score:\n" +
    "- Clarity and articulation (0-25)\n" +
    "- Structure and coherence (0-25)\n" +
    "- Confidence and delivery (0-25)\n" +
    "- Relevance and completeness (0-25)\n\n" +
    `${transcriptSection}` +
    "Return STRICT JSON only with this exact shape:\n" +
    "{\n" +
    '  "overallScore": number,\n' +
    '  "summary": string,\n' +
    '  "strengths": string[],\n' +
    '  "improvements": string[],\n' +
    '  "criteria": [{"name": string, "score": number, "reason": string}]\n' +
    "}\n" +
    "Rules: no markdown, no code fences, no extra keys, score bounds 0-100."
  );
}

function parseScorePayload(raw: string): VideoScoreResult {
  const parsed = JSON.parse(raw) as Partial<VideoScoreResult>;
  if (
    typeof parsed.overallScore !== "number" ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.strengths) ||
    !Array.isArray(parsed.improvements) ||
    !Array.isArray(parsed.criteria)
  ) {
    throw new Error("Gemini returned invalid scoring payload");
  }
  return {
    overallScore: Math.max(0, Math.min(100, parsed.overallScore)),
    summary: parsed.summary,
    strengths: parsed.strengths.filter((v): v is string => typeof v === "string"),
    improvements: parsed.improvements.filter((v): v is string => typeof v === "string"),
    criteria: parsed.criteria
      .filter(
        (c): c is RubricCriterion =>
          typeof c === "object" &&
          c !== null &&
          typeof c.name === "string" &&
          typeof c.score === "number" &&
          typeof c.reason === "string",
      )
      .map((c) => ({
        ...c,
        score: Math.max(0, Math.min(100, c.score)),
      })),
  };
}

export async function scoreVideoAgainstRubric(
  buffer: Buffer | Uint8Array,
  mimeType: string,
  transcript?: string | null,
): Promise<VideoScoreResult> {
  const ai = getClient();
  const blob = new Blob([buffer as unknown as ArrayBuffer], { type: mimeType });
  const uploaded = await ai.files.upload({
    file: blob,
    config: { mimeType },
  });

  if (!uploaded.name) {
    throw new Error("Gemini did not return a file name after upload");
  }

  const ready = await waitForFileActive(ai, uploaded.name, {
    timeoutMs: 180_000,
    intervalMs: 2_000,
  });
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
            { text: buildScoringPrompt(transcript) },
            createPartFromUri(ready.uri, ready.mimeType),
          ],
        },
      ],
    });
    const text = (response.text ?? "").trim();
    if (!text) {
      throw new Error("Gemini returned empty scoring output");
    }
    return parseScorePayload(text);
  } finally {
    try {
      await ai.files.delete({ name: uploaded.name });
    } catch {
      // Non-fatal cleanup failure.
    }
  }
}
