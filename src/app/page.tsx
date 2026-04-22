"use client";

import { Recorder } from "@/components/Recorder";
import { useAuth } from "@/components/AuthProvider";

export default function HomePage() {
  const { user, loading, signIn } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p className="status">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <section className="hero">
          <h1>Lune - Video analysis</h1>
          <p className="lead">
            Record a short video and get an AI-generated transcript.
          </p>
          <button className="btn btn-primary" onClick={() => void signIn()}>
            Sign in with Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>New recording</h1>
      <p className="lead">
        You&apos;re signed in as {user.email}. Recordings are capped at 5 minutes.
      </p>
      <Recorder />
    </main>
  );
}
