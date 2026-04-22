"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function SiteHeader() {
  const { user, loading, signIn, signOut } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      // Always land on a clean root URL after sign-out.
      router.replace("/");
      router.refresh();
      setIsSigningOut(false);
    }
  }

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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
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
