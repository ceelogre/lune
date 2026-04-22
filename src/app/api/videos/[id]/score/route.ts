import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/firebase/auth-helpers";
import { scoreVideoAgainstRubric } from "@/lib/gemini";
import { getSessionUser } from "@/lib/session";
import {
  getStorageBucketName,
  getSupabaseServerClient,
  type VideoRow,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: RouteContext<"/api/videos/[id]/score">,
) {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  try {
    const { data: videoBlob, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(data.storage_path);
    if (downloadError || !videoBlob) {
      throw new Error(downloadError?.message ?? "Unable to download video");
    }

    const score = await scoreVideoAgainstRubric(
      Buffer.from(await videoBlob.arrayBuffer()),
      data.mime_type ?? "video/webm",
      data.transcript,
    );

    const { error: updateError } = await supabase
      .from("videos")
      .update({
        score: score.overallScore,
        rubric_breakdown: score.criteria,
        score_feedback: score.summary,
        score_model: "gemini-2.5-flash",
        scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", id);
    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true, score });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scoring failed";
    await supabase
      .from("videos")
      .update({ error: message, updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
