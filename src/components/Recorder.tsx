"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";

const MAX_DURATION_MS = 5 * 60 * 1000;

type RecorderState =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "preview"
  | "uploading"
  | "transcribing"
  | "done"
  | "error";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function extensionForMime(mime: string): string {
  if (mime.startsWith("video/mp4")) return "mp4";
  return "webm";
}

export function Recorder() {
  const { user, getIdToken } = useAuth();
  const livePreviewRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const [state, setState] = useState<RecorderState>("idle");
  const [remainingMs, setRemainingMs] = useState(MAX_DURATION_MS);
  const [mimeType, setMimeType] = useState<string>("video/webm");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stopMediaStream = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const replaceRecordedUrl = useCallback((nextUrl: string | null) => {
    setRecordedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  }, []);

  const attachPreviewStream = useCallback((stream: MediaStream) => {
    const video = livePreviewRef.current;
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    // Some Safari/Brave builds need a detach/reattach cycle before rendering frames.
    video.srcObject = null;
    video.srcObject = stream;

    const tryPlay = () => video.play().catch(() => undefined);
    void tryPlay();
    void Promise.resolve().then(tryPlay);
    window.setTimeout(() => {
      void tryPlay();
    }, 30);
    window.setTimeout(() => {
      void tryPlay();
    }, 120);
  }, []);

  const cleanupStreams = useCallback(() => {
    stopMediaStream(previewStreamRef.current);
    previewStreamRef.current = null;
    stopMediaStream(recordStreamRef.current);
    recordStreamRef.current = null;
  }, [stopMediaStream]);

  const clearTimers = useCallback(() => {
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      cleanupStreams();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [clearTimers, cleanupStreams, recordedUrl]);

  const requestCamera = useCallback(async () => {
    setError(null);
    setState("requesting");
    try {
      const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;
      const videoConstraints: MediaTrackConstraints = isMobileViewport
        ? {
            facingMode: { ideal: "user" },
            width: { ideal: 1080 },
            height: { ideal: 1350 },
            aspectRatio: { ideal: 4 / 5 },
          }
        : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: "user" },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: true,
      });
      previewStreamRef.current = stream;
      attachPreviewStream(stream);
      setMimeType(pickMimeType());
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access camera/microphone");
      setState("error");
    }
  }, [attachPreviewStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    const previewStream = previewStreamRef.current;
    if (!previewStream) return;

    chunksRef.current = [];
    recordStreamRef.current = previewStream.clone();
    const recorder = new MediaRecorder(recordStreamRef.current, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      clearTimers();
      stopMediaStream(recordStreamRef.current);
      recordStreamRef.current = null;
      const duration = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setDurationMs(duration);
      setRecordedBlob(blob);
      replaceRecordedUrl(URL.createObjectURL(blob));
      cleanupStreams();
      setState("preview");
    };

    startedAtRef.current = Date.now();
    setRemainingMs(MAX_DURATION_MS);
    recorder.start(1000);
    setState("recording");

    countdownRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setRemainingMs(Math.max(0, MAX_DURATION_MS - elapsed));
    }, 250);

    stopTimerRef.current = window.setTimeout(() => {
      stopRecording();
    }, MAX_DURATION_MS);
  }, [cleanupStreams, clearTimers, mimeType, replaceRecordedUrl, stopMediaStream, stopRecording]);

  const resetToIdle = useCallback(() => {
    clearTimers();
    cleanupStreams();
    setRecordedBlob(null);
    replaceRecordedUrl(null);
    setUploadProgress(0);
    setDurationMs(0);
    setRemainingMs(MAX_DURATION_MS);
    setError(null);
    setState("idle");
  }, [cleanupStreams, clearTimers, replaceRecordedUrl]);

  const upload = useCallback(async () => {
    if (!user || !recordedBlob) return;
    setError(null);
    setState("uploading");
    setUploadProgress(0);

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not signed in");

      const createRes = await fetch("/api/videos", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mimeType,
          sizeBytes: recordedBlob.size,
          durationMs,
          extension: extensionForMime(mimeType),
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to create video (${createRes.status})`);
      }
      const { id, storagePath, uploadToken } = (await createRes.json()) as {
        id: string;
        storagePath: string;
        uploadToken: string;
      };

      const supabase = getSupabaseBrowserClient();
      setUploadProgress(15);
      const { error: uploadError } = await supabase.storage
        .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "recordings")
        .uploadToSignedUrl(storagePath, uploadToken, recordedBlob);
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      setUploadProgress(100);

      await fetch(`/api/videos/${id}/complete`, {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}` },
      });

      setState("transcribing");

      const transcribeRes = await fetch(`/api/videos/${id}/transcribe`, {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}` },
      });
      if (!transcribeRes.ok) {
        const body = await transcribeRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Transcription failed (${transcribeRes.status})`);
      }

      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }, [durationMs, getIdToken, mimeType, recordedBlob, user]);

  const countdownClass = useMemo(() => {
    if (remainingMs <= 30_000) return "countdown danger";
    if (remainingMs <= 60_000) return "countdown warn";
    return "countdown";
  }, [remainingMs]);

  const showLivePreview = state === "ready" || state === "recording";
  const showPlayback = state === "preview" || state === "uploading" || state === "transcribing" || state === "done";

  useEffect(() => {
    if (!showLivePreview) return;
    const stream = previewStreamRef.current;
    if (!stream) return;
    attachPreviewStream(stream);
  }, [attachPreviewStream, showLivePreview]);

  return (
    <div className="recorder card">
      {showLivePreview ? (
        <div className="recorder-preview-wrap">
          <video
            ref={livePreviewRef}
            className="recorder-video"
            autoPlay
            playsInline
            muted
          />
          <div className="head-guide" aria-hidden="true">
            <div className="head-guide-ring" />
            <p className="head-guide-text">Center your face in the oval</p>
          </div>
        </div>
      ) : null}

      {showPlayback && recordedUrl ? (
        <video
          className="recorder-video"
          src={recordedUrl}
          controls
          playsInline
        />
      ) : null}

      {state === "idle" && (
        <div>
          <p className="status">
            Record a video up to 5 minutes long. We&apos;ll upload it and generate a
            transcript with Gemini.
          </p>
        </div>
      )}

      <div className="recorder-controls">
        {state === "idle" && (
          <button className="btn btn-primary" onClick={() => void requestCamera()}>
            Enable camera
          </button>
        )}

        {state === "requesting" && <span className="status">Requesting camera access…</span>}

        {state === "ready" && (
          <>
            <button className="btn btn-primary" onClick={startRecording}>
              Start recording
            </button>
            <button className="btn btn-ghost" onClick={resetToIdle}>
              Cancel
            </button>
          </>
        )}

        {state === "recording" && (
          <>
            <button className="btn btn-danger" onClick={stopRecording}>
              Stop
            </button>
            <span className={countdownClass}>{formatMs(remainingMs)} remaining</span>
          </>
        )}

        {state === "preview" && (
          <>
            <button className="btn btn-primary" onClick={() => void upload()}>
              Upload & transcribe
            </button>
            <button className="btn btn-ghost" onClick={resetToIdle}>
              Discard
            </button>
            <span className="status">Recording: {formatMs(durationMs)}</span>
          </>
        )}

        {(state === "uploading" || state === "transcribing") && (
          <span className="status">
            {state === "uploading"
              ? `Uploading… ${Math.round(uploadProgress)}%`
              : "Transcribing with Gemini…"}
          </span>
        )}

        {state === "done" && (
          <>
            <span className="status success">
              Uploaded and transcribed. An admin can review it in the panel.
            </span>
            <button className="btn btn-primary" onClick={resetToIdle}>
              Record another
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <button className="btn btn-ghost" onClick={resetToIdle}>
              Start over
            </button>
          </>
        )}
      </div>

      {state === "uploading" && (
        <div className="progress">
          <div style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {error && <p className="status error">{error}</p>}
    </div>
  );
}
