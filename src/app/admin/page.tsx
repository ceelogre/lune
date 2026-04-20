import Link from "next/link";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type VideoRow = {
  id: string;
  email: string | null;
  status: string;
  durationMs: number | null;
  createdAt: number | null;
};

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

async function listVideos(): Promise<VideoRow[]> {
  const snap = await adminDb()
    .collection("videos")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toMillis?.() ?? null;
    return {
      id: doc.id,
      email: (data.email as string | null) ?? null,
      status: (data.status as string) ?? "unknown",
      durationMs: (data.durationMs as number | null) ?? null,
      createdAt,
    };
  });
}

export default async function AdminVideosPage() {
  const videos = await listVideos();

  return (
    <main className="page">
      <h1>Recordings</h1>
      <p className="lead">Every video recorded through Lune, most recent first.</p>

      {videos.length === 0 ? (
        <div className="card">
          <p className="status">No recordings yet.</p>
        </div>
      ) : (
        <table className="videos-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Recorded</th>
              <th>Duration</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.id}>
                <td>{v.email ?? "—"}</td>
                <td>{formatDate(v.createdAt)}</td>
                <td>{formatDuration(v.durationMs)}</td>
                <td>
                  <span className={`badge ${v.status}`}>{v.status}</span>
                </td>
                <td>
                  <Link href={`/admin/${v.id}`} className="nav-link">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
