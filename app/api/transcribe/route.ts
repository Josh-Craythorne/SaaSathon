import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AUDIO_BYTES, validateWav } from "@/lib/dictation";
import { transcribeAudio } from "@/lib/transcription-provider";
export const runtime = "nodejs";
export const maxDuration = 60;
const reply = (data: object, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub)
    return reply({ error: "Sign in again before transcribing." }, 401);
  const origin = req.headers.get("origin");
  const expectedOrigin = `${new URL(req.url).protocol}//${req.headers.get("host")}`;
  if (!origin || origin !== expectedOrigin)
    return reply({ error: "Request origin is not allowed." }, 403);
  const ids = z
    .object({ id: z.uuid(), visit: z.uuid() })
    .safeParse({
      id: req.headers.get("x-recording-id"),
      visit: req.headers.get("x-visit-id"),
    });
  if (!ids.success) return reply({ error: "Invalid recording or visit." }, 400);
  if (
    req.headers.get("content-type") !== "audio/wav" ||
    Number(req.headers.get("content-length")) > AUDIO_BYTES
  )
    return reply({ error: "Use a WAV recording up to two minutes." }, 413);
  const { data: visit } = await supabase
    .from("visits")
    .select("id")
    .eq("id", ids.data.visit)
    .eq("user_id", data.claims.sub)
    .maybeSingle();
  if (!visit) return reply({ error: "Visit not found." }, 404);
  if (!process.env.OPENAI_API_KEY)
    return reply(
      { error: "Whisper is not configured. You can keep typing notes." },
      503,
    );
  let lease: string | undefined;
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Recording is empty." }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    const uploadTimeout = setTimeout(() => void reader.cancel(), 10000);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > AUDIO_BYTES) {
          await reader.cancel();
          return reply({ error: "Recording exceeds two minutes." }, 413);
        }
        chunks.push(value);
      }
    } finally {
      clearTimeout(uploadTimeout);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      validateWav(bytes, "audio/wav");
    } catch (e) {
      return reply({ error: (e as Error).message }, 400);
    }
    const reserved = await supabase.rpc("begin_transcription", {
      p_id: ids.data.id,
      p_visit: ids.data.visit,
      p_digest: createHash("sha256").update(bytes).digest("hex"),
    });
    const reservation = z
      .object({
        lease: z.uuid().optional(),
        text: z.string().optional(),
        error: z.string().optional(),
      })
      .safeParse(reserved.data);
    if (reserved.error || !reservation.success)
      return reply(
        {
          error:
            "Could not authorize transcription. Check the database migration and retry.",
        },
        503,
      );
    if (reservation.data.error)
      return reply({ error: reservation.data.error }, 429);
    if (reservation.data.text) return reply({ text: reservation.data.text });
    lease = reservation.data.lease;
    if (!lease) throw new Error("Could not start transcription.");
    const text = await transcribeAudio(
      bytes,
      process.env.OPENAI_API_KEY,
      req.signal,
    );
    const completed = await supabase.rpc("finish_transcription", {
      p_id: ids.data.id,
      p_lease: lease,
      p_text: text,
    });
    if (completed.error)
      throw new Error(
        "Transcript could not be confirmed. Retry this recording.",
      );
    return reply({ text });
  } catch (e) {
    if (lease)
      await supabase.rpc("finish_transcription", {
        p_id: ids.data.id,
        p_lease: lease,
        p_text: null,
      });
    return reply(
      {
        error:
          e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name)
            ? "Transcription timed out or was cancelled. Retry the retained recording."
            : e instanceof Error
              ? e.message
              : "Transcription failed. Retry the retained recording.",
      },
      502,
    );
  }
}
