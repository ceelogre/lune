import { NextResponse, type NextRequest } from "next/server";
import { AuthError, verifyIdTokenFromRequest } from "@/lib/firebase/auth-helpers";
import { transcribeVideo } from "@/lib/gemini";
import {
  getStorageBucketName,
  getSupabaseServerClient,
  type VideoRow,
} from "@/lib/supabase/server";

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
  const supabase = getSupabaseServerClient();
  const bucket = getStorageBucketName();
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", id)
    .single<VideoRow>();
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (data.uid !== decoded.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storagePath = data.storage_path;
  const mimeType = data.mime_type ?? "video/webm";

  try {
    const { data: videoBlob, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(storagePath);
    if (downloadError || !videoBlob) {
      throw new Error(downloadError?.message ?? "Unable to download video");
    }
    const transcript = await transcribeVideo(
      Buffer.from(await videoBlob.arrayBuffer()),
      mimeType,
    );

    const transcriptPath = `transcripts/${decoded.uid}/${id}.txt`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(
      transcriptPath,
      transcript,
      {
        contentType: "text/plain; charset=utf-8",
        upsert: true,
      },
    );
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: updateError } = await supabase
      .from("videos")
      .update({
        status: "ready",
        transcript,
        transcript_path: transcriptPath,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true, transcriptPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
