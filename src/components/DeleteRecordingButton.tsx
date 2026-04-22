"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DeleteRecordingButtonProps = {
  recordingId: string;
  redirectTo?: string;
  className?: string;
};

export function DeleteRecordingButton({
  recordingId,
  redirectTo,
  className = "btn btn-ghost",
}: DeleteRecordingButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this recording and transcript permanently?",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/videos/${recordingId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Delete failed (${response.status})`);
      }

      if (redirectTo) {
        router.replace(redirectTo);
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to delete recording");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void handleDelete()}
      disabled={isDeleting}
    >
      {isDeleting ? "Deleting..." : "Delete"}
    </button>
  );
}
