import { adminAuth } from "./admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 401,
  ) {
    super(message);
  }
}

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email.toLowerCase());
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function verifyIdTokenFromRequest(request: Request): Promise<DecodedIdToken> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new AuthError("Missing bearer token", 401);
  }
  try {
    return await adminAuth().verifyIdToken(token);
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
}

export async function requireAdmin(request: Request): Promise<DecodedIdToken> {
  const decoded = await verifyIdTokenFromRequest(request);
  if (!isAdminEmail(decoded.email)) {
    throw new AuthError("Forbidden", 403);
  }
  return decoded;
}

export async function verifyIdTokenString(idToken: string): Promise<DecodedIdToken> {
  try {
    return await adminAuth().verifyIdToken(idToken);
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
}
