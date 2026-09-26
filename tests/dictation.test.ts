import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dictationReducer as reduce,
  initialDictation,
  appendTranscript,
  pcmWav,
  validateWav,
  AUDIO_BYTES,
} from "../lib/dictation";
import { transcribeAudio } from "../lib/transcription-provider";

test("dictation moves through permission, recording, transcription, review and one insertion", () => {
  let s = reduce(initialDictation, { type: "start" });
  assert.equal(s.phase, "requesting");
  s = reduce(s, { type: "recording", generation: 1 });
  assert.equal(s.phase, "recording");
  s = reduce(s, { type: "transcribing", generation: 1 });
  s = reduce(s, { type: "result", generation: 1, text: "Unreviewed" });
  assert.equal(s.phase, "transcript");
  assert.equal(s.inserted, false);
  s = reduce(s, { type: "edit", generation: 1, text: "Engineer correction" });
  s = reduce(s, { type: "insert", generation: 1 });
  assert.equal(s.text, "Engineer correction");
  assert.equal(s.inserted, true);
  assert.equal(reduce(s, { type: "insert", generation: 1 }), s);
  assert.equal(
    reduce(s, { type: "edit", generation: 1, text: "late edit" }),
    s,
  );
});
test("cancellation and observation unmount generation reject late permissions, errors and results", () => {
  let s = reduce(initialDictation, { type: "start" });
  s = reduce(s, { type: "cancel" });
  for (const type of ["recording", "transcribing", "result", "error"] as const)
    assert.equal(reduce(s, { type, generation: 1, text: "stale" }), s);
  s = reduce(s, { type: "start" });
  assert.equal(s.generation, 3);
  assert.equal(
    reduce(s, { type: "result", generation: 1, text: "wrong observation" }),
    s,
  );
});
test("failed transcription supports explicit retry without losing existing or concurrent note edits", () => {
  let s = reduce(initialDictation, { type: "start" });
  s = reduce(s, { type: "recording", generation: 1 });
  s = reduce(s, { type: "transcribing", generation: 1 });
  s = reduce(s, { type: "error", generation: 1, text: "Offline" });
  assert.equal(s.phase, "error");
  s = reduce(s, { type: "transcribing", generation: 1 });
  assert.equal(s.error, "");
  s = reduce(s, { type: "result", generation: 1, text: "Recorded words" });
  assert.equal(
    appendTranscript("Original notes\nTyped while pending", s.text),
    "Original notes\nTyped while pending\n\nRecorded words",
  );
  assert.throws(() => appendTranscript("x".repeat(9999), "too long"), /10,000/);
  assert.equal(appendTranscript("Keep whitespace  ", " "), "Keep whitespace  ");
});
test("audio validation checks actual PCM duration, size, format, headers and silence", () => {
  const wav = pcmWav(new Float32Array(16000).fill(0.1));
  assert.equal(validateWav(wav, "audio/wav"), 1);
  assert.throws(() => validateWav(wav, "audio/webm"));
  assert.throws(() => validateWav(new Uint8Array(), "audio/wav"));
  assert.throws(() =>
    validateWav(new Uint8Array(AUDIO_BYTES + 1), "audio/wav"),
  );
  assert.throws(
    () => validateWav(pcmWav(new Float32Array(16000)), "audio/wav"),
    /audible/,
  );
  assert.throws(() =>
    validateWav(pcmWav(new Float32Array(100).fill(0.2)), "audio/wav"),
  );
  wav[24] = 1;
  assert.throws(() => validateWav(wav, "audio/wav"), /format/);
});
test("Whisper transport uses server credential and validates provider result (mocked)", async () => {
  const mock: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-placeholder",
    );
    const body = init?.body as FormData;
    assert.equal(body.get("model"), "whisper-1");
    assert.equal((body.get("file") as Blob).type, "audio/wav");
    assert.ok(init?.signal);
    return Response.json({ text: " Engineer words. ", duration: 1 });
  };
  assert.equal(
    await transcribeAudio(
      new Uint8Array(),
      "test-placeholder",
      new AbortController().signal,
      mock,
    ),
    "Engineer words.",
  );
  await assert.rejects(
    transcribeAudio(
      new Uint8Array(),
      "test-placeholder",
      new AbortController().signal,
      async () => Response.json({ text: "", duration: 1 }),
    ),
    /usable transcript/,
  );
  await assert.rejects(
    transcribeAudio(
      new Uint8Array(),
      "test-placeholder",
      new AbortController().signal,
      async () => new Response("private provider detail", { status: 401 }),
    ),
    /server API key/,
  );
});
test("cancellation reaches the provider and failures allow a subsequent explicit retry (mocked)", async () => {
  const controller = new AbortController();
  const mock: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Cancelled", "AbortError")),
        { once: true },
      );
    });
  const pending = transcribeAudio(
    new Uint8Array(),
    "test-placeholder",
    controller.signal,
    mock,
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const result = await transcribeAudio(
    new Uint8Array(),
    "test-placeholder",
    new AbortController().signal,
    async () => Response.json({ text: "Retried", duration: 1 }),
  );
  assert.equal(result, "Retried");
});

test("explicit generation supports Strict Mode cleanup and immediate new recordings", () => {
  let s = reduce(initialDictation, { type: "start", generation: 2 });
  s = reduce(s, { type: "recording", generation: 2 });
  assert.equal(s.phase, "recording");
  s = reduce(s, { type: "cancel", generation: 3 });
  s = reduce(s, { type: "start", generation: 4 });
  assert.equal(
    reduce(s, { type: "error", generation: 2, text: "old microphone" }),
    s,
  );
  assert.equal(
    reduce(s, { type: "recording", generation: 4 }).phase,
    "recording",
  );
});
