import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { AuthError, verifyIdTokenFromRequest } from "@/lib/firebase/auth-helpers";
import { transcribeVideo } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/videos/[id]/transcribe">,
) {
  let decoded;
  try {
    decoded = await verifyIdTokenFromRequest(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await context.params;
  const db = adminDb();
  const docRef = db.collection("videos").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const data = snap.data()!;
  if (data.uid !== decoded.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storagePath = data.storagePath as string;
  const mimeType = (data.mimeType as string) ?? "video/webm";

  try {
    const bucket = adminBucket();
    const [buffer] = await bucket.file(storagePath).download();
    const transcript = await transcribeVideo(buffer, mimeType);

    const transcriptPath = `transcripts/${decoded.uid}/${id}.txt`;
    await bucket.file(transcriptPath).save(transcript, {
      contentType: "text/plain; charset=utf-8",
      resumable: false,
      metadata: {
        metadata: {
          uid: decoded.uid,
          videoId: id,
          model: "gemini-2.5-flash",
        },
      },
    });

    await docRef.update({
      status: "ready",
      transcript,
      transcriptPath,
      error: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, transcriptPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    await docRef.update({
      status: "failed",
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
