"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import {
  AUDIO_SECONDS,
  dictationReducer,
  initialDictation,
  pcmWav,
  validateWav,
} from "@/lib/dictation";
export function Dictation({
  visitId,
  onInsert,
  onWork,
}: {
  visitId: string;
  onInsert: (text: string) => boolean;
  onWork: (active: boolean) => void;
}) {
  const [state, dispatch] = useReducer(dictationReducer, initialDictation);
  const [seconds, setSeconds] = useState(0);
  const [retained, setRetained] = useState(false);
  const generation = useRef(0),
    stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    request = useRef<AbortController | null>(null),
    audio = useRef<Blob | null>(null),
    wav = useRef<Uint8Array | null>(null),
    id = useRef(""),
    busy = useRef(false),
    inserted = useRef(false);
  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  const cleanup = useCallback(() => {
    request.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
    audio.current = null;
    wav.current = null;
    busy.current = false;
  }, [release]);
  useEffect(
    () => () => {
      generation.current++;
      cleanup();
    },
    [cleanup],
  ); // All late callbacks check generation before writing state.
  useEffect(() => {
    onWork(
      state.phase !== "ready" &&
        !state.inserted &&
        (state.phase !== "error" || retained),
    );
  }, [state.phase, state.inserted, retained, onWork]);
  function cancel() {
    generation.current++;
    cleanup();
    setRetained(false);
    inserted.current = false;
    dispatch({ type: "cancel", generation: generation.current });
  }
  async function transcribe(g: number) {
    if (busy.current || !audio.current) return;
    busy.current = true;
    dispatch({ type: "transcribing", generation: g });
    try {
      if (!wav.current) {
        const context = new AudioContext();
        let decoded: AudioBuffer;
        try {
          decoded = await context.decodeAudioData(
            await audio.current.arrayBuffer(),
          );
        } finally {
          await context.close();
        }
        if (g !== generation.current) return;
        if (decoded.duration > AUDIO_SECONDS + 0.5)
          throw new Error(
            "Recording was too long. Please record a shorter note.",
          );
        const offline = new OfflineAudioContext(
          1,
          Math.min(16000 * AUDIO_SECONDS, Math.ceil(decoded.duration * 16000)),
          16000,
        );
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const rendered = await offline.startRendering();
        if (g !== generation.current) return;
        wav.current = pcmWav(rendered.getChannelData(0));
        validateWav(wav.current, "audio/wav");
      }
      request.current = new AbortController();
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "audio/wav",
          "x-recording-id": id.current,
          "x-visit-id": visitId,
        },
        body: new Uint8Array(wav.current!),
        signal: AbortSignal.any([
          request.current.signal,
          AbortSignal.timeout(55000),
        ]),
      });
      const result = await response.json();
      if (g !== generation.current) return;
      if (!response.ok)
        throw new Error(
          result.error || "Transcription failed. Retry when connected.",
        );
      if (typeof result.text !== "string" || !result.text.trim())
        throw new Error("No speech was returned. Record again.");
      dispatch({ type: "result", generation: g, text: result.text });
    } catch (e) {
      if (g === generation.current)
        dispatch({
          type: "error",
          generation: g,
          text:
            e instanceof Error &&
            ["AbortError", "TimeoutError"].includes(e.name)
              ? "Connection timed out. Your recording is retained; retry when connected."
              : e instanceof TypeError
                ? "Could not connect to transcription. Check your connection and retry the retained recording."
                : e instanceof Error
                  ? e.message
                  : "Transcription failed. Your recording is retained.",
        });
    } finally {
      if (g === generation.current) busy.current = false;
    }
  }
  async function start() {
    if (
      busy.current ||
      ["requesting", "recording", "transcribing"].includes(state.phase)
    )
      return;
    cleanup();
    setRetained(false);
    inserted.current = false;
    busy.current = true;
    const g = ++generation.current;
    id.current = crypto.randomUUID();
    setSeconds(0);
    dispatch({ type: "start", generation: g });
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable in this browser. Use HTTPS and a supported browser, or type notes below.",
        );
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      if (!mime)
        throw new Error(
          "This browser cannot record a supported audio format. Type your notes or try another browser.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (g !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const r = new MediaRecorder(media, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      recorder.current = r;
      const chunks: Blob[] = [];
      let size = 0;
      const began = Date.now();
      r.ondataavailable = (e) => {
        if (g !== generation.current) return;
        if (e.data.size) {
          chunks.push(e.data);
          size += e.data.size;
          if (size > 8 * 1024 * 1024 && r.state === "recording") r.stop();
        }
      };
      r.onerror = () => {
        if (g !== generation.current) return;
        generation.current++;
        cleanup();
        dispatch({ type: "cancel", generation: generation.current });
        dispatch({
          type: "error",
          generation: g + 1,
          text: "Microphone recording failed. Please record again.",
        });
      };
      r.onstop = () => {
        if (g !== generation.current) return;
        release();
        audio.current = new Blob(chunks, { type: mime });
        setRetained(true);
        void transcribe(g);
      };
      r.start(250);
      dispatch({ type: "recording", generation: g });
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= AUDIO_SECONDS && r.state === "recording") r.stop();
      }, 250);
    } catch (e) {
      if (g !== generation.current) return;
      release();
      dispatch({
        type: "error",
        generation: g,
        text:
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow it in browser settings and retry, or keep typing."
            : e instanceof Error
              ? e.message
              : "Microphone could not start.",
      });
    } finally {
      if (g === generation.current) busy.current = false;
    }
  }
  const labels = {
    ready: "Ready to record",
    requesting: "Requesting microphone access…",
    recording: `Recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
    transcribing: "Transcribing with Whisper…",
    transcript: state.inserted
      ? "Transcript inserted"
      : "Transcript ready for review",
    error: "Dictation needs attention",
  };
  return (
    <div className="dictation-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong role="status" className="text-sm">
          {labels[state.phase]}
        </strong>
        {["ready", "error"].includes(state.phase) && (
          <Button type="button" variant="outline" onClick={() => void start()}>
            <Mic />
            Record note
          </Button>
        )}
        {state.phase === "recording" && (
          <Button
            type="button"
            onClick={() => {
              if (recorder.current?.state === "recording")
                recorder.current.stop();
            }}
          >
            <Square />
            Stop &amp; transcribe
          </Button>
        )}
        {state.phase !== "ready" && (
          <Button type="button" variant="ghost" onClick={cancel}>
            <X />
            {state.inserted ? "Done" : "Cancel"}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-charcoal">
        Up to 2 minutes. When you stop, audio is sent securely to OpenAI
        Whisper. Review before inserting. Nothing is saved automatically.
      </p>
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.phase === "error" && retained && (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => void transcribe(generation.current)}
        >
          Retry retained recording
        </Button>
      )}
      {state.phase === "transcript" && (
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Review transcript
            <textarea
              className={fieldClass}
              value={state.text}
              rows={4}
              maxLength={10000}
              disabled={state.inserted}
              onChange={(e) =>
                dispatch({
                  type: "edit",
                  generation: generation.current,
                  text: e.target.value,
                })
              }
            />
          </label>
          <Button
            type="button"
            disabled={state.inserted || !state.text.trim()}
            onClick={() => {
              if (inserted.current) return;
              if (onInsert(state.text)) {
                inserted.current = true;
                audio.current = null;
                wav.current = null;
                dispatch({ type: "insert", generation: generation.current });
              }
            }}
          >
            {state.inserted ? "Inserted once" : "Insert into notes"}
          </Button>
        </div>
      )}
    </div>
  );
}
