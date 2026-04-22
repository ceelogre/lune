import { createClient } from "@supabase/supabase-js";

export type VideoRow = {
  id: string;
  uid: string;
  email: string | null;
  storage_path: string;
  transcript_path: string | null;
  transcript: string | null;
  mime_type: string | null;
  status: "uploading" | "transcribing" | "ready" | "failed";
  duration_ms: number | null;
  size_bytes: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
}

export function getStorageBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "recordings";
}
