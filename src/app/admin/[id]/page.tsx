import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorageBucketName, getSupabaseServerClient, type VideoRow } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type VideoDoc = {
  uid: string;
  email: string | null;
  storagePath: string;
  transcriptPath: string | null;
  transcript: string | null;
  mimeType: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  status: string;
  error: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

async function getVideo(id: string): Promise<VideoDoc | null> {
  const { data, error } = await getSupabaseServerClient()
    .from("videos")
    .select("*")
    .eq("id", id)
    .single<VideoRow>();
  if (error || !data) return null;
  return {
    uid: data.uid,
    email: data.email ?? null,
    storagePath: data.storage_path,
    transcriptPath: data.transcript_path ?? null,
    transcript: data.transcript ?? null,
    mimeType: data.mime_type ?? null,
    durationMs: data.duration_ms ?? null,
    sizeBytes: data.size_bytes ?? null,
    status: data.status ?? "unknown",
    error: data.error ?? null,
    createdAt: data.created_at ? new Date(data.created_at).getTime() : null,
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : null,
  };
}

async function getSignedUrl(path: string): Promise<string> {
  const { data, error } = await getSupabaseServerClient()
    .storage
    .from(getStorageBucketName())
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signed URL");
  }
  return data.signedUrl;
}

async function getTranscript(video: VideoDoc): Promise<string | null> {
  if (video.transcript) return video.transcript;
  if (!video.transcriptPath) return null;
  try {
    const { data, error } = await getSupabaseServerClient()
      .storage
      .from(getStorageBucketName())
      .download(video.transcriptPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer()).toString("utf-8");
  } catch {
    return null;
  }
}

export default async function AdminVideoDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const video = await getVideo(id);
  if (!video) notFound();

  const [videoUrl, transcript] = await Promise.all([
    getSignedUrl(video.storagePath).catch(() => null),
    getTranscript(video),
  ]);

  return (
    <main className="page">
      <p className="lead">
        <Link href="/admin" className="nav-link">
          ← All recordings
        </Link>
      </p>
      <h1>Recording detail</h1>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "10rem 1fr",
            rowGap: "0.5rem",
            columnGap: "1rem",
          }}
        >
          <dt className="status">User</dt>
          <dd>{video.email ?? video.uid}</dd>
          <dt className="status">Status</dt>
          <dd>
            <span className={`badge ${video.status}`}>{video.status}</span>
          </dd>
          <dt className="status">Duration</dt>
          <dd>{formatDuration(video.durationMs)}</dd>
          <dt className="status">Size</dt>
          <dd>{formatBytes(video.sizeBytes)}</dd>
          <dt className="status">Recorded</dt>
          <dd>{video.createdAt ? new Date(video.createdAt).toLocaleString() : "—"}</dd>
          {video.error ? (
            <>
              <dt className="status">Error</dt>
              <dd className="status error">{video.error}</dd>
            </>
          ) : null}
        </dl>
      </div>

      {videoUrl ? (
        <video
          controls
          playsInline
          src={videoUrl}
          className="recorder-video"
          style={{ marginBottom: "1.5rem" }}
        />
      ) : (
        <p className="status error">Unable to load video file.</p>
      )}

      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "1.5rem 0 0.75rem" }}>
        Transcript
      </h2>
      {transcript ? (
        <pre className="transcript">{transcript}</pre>
      ) : (
        <p className="status">
          {video.status === "ready"
            ? "No transcript text available."
            : "Transcript not ready yet."}
        </p>
      )}
    </main>
  );
}
