import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export const SESSION_COOKIE = "lune_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 5;

export async function getSessionUser(): Promise<DecodedIdToken | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await adminAuth().verifySessionCookie(token, true);
  } catch {
    return null;
  }
}
