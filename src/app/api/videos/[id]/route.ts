import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/firebase/auth-helpers";
import { getSessionUser } from "@/lib/session";
import {
  getStorageBucketName,
  getSupabaseServerClient,
  type VideoRow,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/videos/[id]">,
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

  const filesToDelete = [data.storage_path, data.transcript_path].filter(
    (path): path is string => Boolean(path),
  );
  if (filesToDelete.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(bucket)
      .remove(filesToDelete);
    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase.from("videos").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
