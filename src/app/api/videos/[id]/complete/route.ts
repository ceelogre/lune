import { NextResponse, type NextRequest } from "next/server";
import { AuthError, verifyIdTokenFromRequest } from "@/lib/firebase/auth-helpers";
import { getSupabaseServerClient, type VideoRow } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/videos/[id]/complete">,
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

  const { error: updateError } = await supabase.from("videos").update({
    status: "transcribing",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
