"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function SiteHeader() {
  const { user, loading, signIn, signOut } = useAuth();

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        Lune
      </Link>
      <nav className="nav">
        {user ? (
          <>
            <Link href="/admin" className="nav-link">
              Admin
            </Link>
            <span className="user-email" title={user.email ?? undefined}>
              {user.email}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void signIn()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Sign in with Google"}
          </button>
        )}
      </nav>
    </header>
  );
}
