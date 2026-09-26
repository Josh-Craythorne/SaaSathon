import { z } from "zod";
export async function transcribeAudio(
  bytes: Uint8Array,
  key: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
) {
  const body = new FormData();
  body.set("model", "whisper-1");
  body.set("response_format", "verbose_json");
  body.set(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
    "site-note.wav",
  );
  const response = await request(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Transcription service is busy or its quota is unavailable. Retry later; your recording is retained."
        : response.status === 401
          ? "Transcription is not configured correctly. Ask the owner to check the server API key."
          : "The transcription service could not process this recording. Retry or record again.",
    );
  const parsed = z
    .object({
      text: z.string().trim().min(1).max(10000),
      duration: z.number().min(0).max(121),
    })
    .safeParse(await response.json());
  if (!parsed.success)
    throw new Error(
      "No usable transcript was returned. Try a clearer recording.",
    );
  return parsed.data.text;
}
