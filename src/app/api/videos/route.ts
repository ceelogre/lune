import { NextResponse } from "next/server";
import { AuthError, verifyIdTokenFromRequest } from "@/lib/firebase/auth-helpers";
import { getStorageBucketName, getSupabaseServerClient } from "@/lib/supabase/server";

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

  const id = crypto.randomUUID();
  const storagePath = `videos/${decoded.uid}/${id}.${extension}`;

  const supabase = getSupabaseServerClient();
  const bucket = getStorageBucketName();
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);
  if (uploadError || !uploadData?.token) {
    return NextResponse.json(
      { error: uploadError?.message ?? "Failed to prepare upload URL" },
      { status: 500 },
    );
  }

  const { error: insertError } = await supabase.from("videos").insert({
    id,
    uid: decoded.uid,
    email: decoded.email ?? null,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
    duration_ms: typeof body.durationMs === "number" ? body.durationMs : null,
    status: "uploading",
    transcript: null,
    transcript_path: null,
    error: null,
    updated_at: new Date().toISOString(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ id, storagePath, uploadToken: uploadData.token });
}
