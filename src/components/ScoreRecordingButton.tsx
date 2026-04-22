"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ScoreRecordingButtonProps = {
  recordingId: string;
};

export function ScoreRecordingButton({ recordingId }: ScoreRecordingButtonProps) {
  const router = useRouter();
  const [isScoring, setIsScoring] = useState(false);

  async function handleScore() {
    setIsScoring(true);
    try {
      const response = await fetch(`/api/videos/${recordingId}/score`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Scoring failed (${response.status})`);
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to score recording");
    } finally {
      setIsScoring(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => void handleScore()}
      disabled={isScoring}
    >
      {isScoring ? "Scoring..." : "Score recording"}
    </button>
  );
}
