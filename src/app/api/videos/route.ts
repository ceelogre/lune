import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { AuthError, verifyIdTokenFromRequest } from "@/lib/firebase/auth-helpers";

export const runtime = "nodejs";

type CreateVideoBody = {
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
  extension?: string;
};

function safeExtension(value: string | undefined): string {
  if (!value) return "webm";
  return /^[a-z0-9]{1,8}$/i.test(value) ? value.toLowerCase() : "webm";
}

export async function POST(request: Request) {
  let decoded;
  try {
    decoded = await verifyIdTokenFromRequest(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await request.json().catch(() => ({}))) as CreateVideoBody;
  const mimeType = body.mimeType ?? "video/webm";
  const extension = safeExtension(body.extension);

  const db = adminDb();
  const docRef = db.collection("videos").doc();
  const storagePath = `videos/${decoded.uid}/${docRef.id}.${extension}`;

  await docRef.set({
    uid: decoded.uid,
    email: decoded.email ?? null,
    storagePath,
    mimeType,
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
    status: "uploading",
    transcript: null,
    transcriptPath: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: docRef.id, storagePath });
}
