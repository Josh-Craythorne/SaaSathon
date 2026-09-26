export const AUDIO_SECONDS = 120;
export const AUDIO_BYTES = 44 + 16000 * 2 * AUDIO_SECONDS;
export type DictationPhase =
  | "ready"
  | "requesting"
  | "recording"
  | "transcribing"
  | "transcript"
  | "error";
export type DictationState = {
  phase: DictationPhase;
  generation: number;
  text: string;
  error: string;
  inserted: boolean;
};
export const initialDictation: DictationState = {
  phase: "ready",
  generation: 0,
  text: "",
  error: "",
  inserted: false,
};
export type DictationEvent =
  | { type: "start"; generation?: number }
  | { type: "cancel"; generation?: number }
  | {
      type:
        | "recording"
        | "transcribing"
        | "result"
        | "error"
        | "edit"
        | "insert";
      generation: number;
      text?: string;
    };
export function dictationReducer(
  s: DictationState,
  e: DictationEvent,
): DictationState {
  if (e.type === "cancel")
    return {
      ...initialDictation,
      generation: e.generation ?? s.generation + 1,
    };
  if (e.type === "start")
    return {
      ...initialDictation,
      phase: "requesting",
      generation: e.generation ?? s.generation + 1,
    };
  if (e.generation !== s.generation) return s;
  if (e.type === "recording" && s.phase === "requesting")
    return { ...s, phase: "recording" };
  if (e.type === "transcribing" && ["recording", "error"].includes(s.phase))
    return { ...s, phase: "transcribing", error: "" };
  if (e.type === "result" && s.phase === "transcribing")
    return { ...s, phase: "transcript", text: e.text ?? "" };
  if (e.type === "error")
    return { ...s, phase: "error", error: e.text ?? "Recording failed." };
  if (e.type === "edit" && s.phase === "transcript" && !s.inserted)
    return { ...s, text: e.text ?? "" };
  if (e.type === "insert" && s.phase === "transcript" && !s.inserted)
    return { ...s, inserted: true };
  return s;
}
export function appendTranscript(notes: string, transcript: string) {
  const value = transcript.trim();
  if (!value) return notes;
  const result = notes + (notes ? "\n\n" : "") + value;
  if (result.length > 10000)
    throw new Error(
      "Notes would exceed 10,000 characters. Shorten the transcript before inserting.",
    );
  return result;
}
// Canonical mono PCM WAV avoids trusting caller-supplied duration or compressed metadata.
export function validateWav(bytes: Uint8Array, mime: string) {
  if (mime !== "audio/wav" || bytes.length < 100 || bytes.length > AUDIO_BYTES)
    throw new Error("Use a non-empty recording of at most two minutes.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, end: number) =>
    new TextDecoder().decode(bytes.slice(start, end));
  if (
    text(0, 4) !== "RIFF" ||
    text(8, 12) !== "WAVE" ||
    text(12, 16) !== "fmt " ||
    text(36, 40) !== "data" ||
    v.getUint32(4, true) !== bytes.length - 8 ||
    v.getUint32(16, true) !== 16 ||
    v.getUint16(20, true) !== 1 ||
    v.getUint16(22, true) !== 1 ||
    v.getUint32(24, true) !== 16000 ||
    v.getUint32(28, true) !== 32000 ||
    v.getUint16(32, true) !== 2 ||
    v.getUint16(34, true) !== 16 ||
    v.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw new Error(
      "Recording format is invalid. Record again in a supported browser.",
    );
  const duration = (bytes.length - 44) / 32000;
  if (duration < 0.3 || duration > AUDIO_SECONDS)
    throw new Error("Record between one second and two minutes.");
  let peak = 0;
  for (let i = 44; i < bytes.length; i += 2)
    peak = Math.max(peak, Math.abs(v.getInt16(i, true)));
  if (peak < 20)
    throw new Error(
      "No audible sound detected. Check your microphone and record again.",
    );
  return duration;
}
export function pcmWav(samples: Float32Array) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const write = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  v.setUint32(4, buffer.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((n, i) =>
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, n)) * 32767, true),
  );
  return new Uint8Array(buffer);
}
