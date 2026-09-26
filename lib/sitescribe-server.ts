import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/lib/validation";
import { MAX_FILE_BYTES, validImage } from "@/lib/sitescribe";

// Supabase caps a response at 1,000 rows. Never silently omit older evidence.
export async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await page(from, from + 499);
    if (error || !data)
      throw new Error(
        "Could not load all records. Check your connection and database migrations, then retry.",
      );
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function projectData(id: string) {
  if (!idSchema.safeParse(id).success) notFound();
  const { supabase, userId } = await requireUser();
  const results = await Promise.all([
    supabase
      .from("projects")
      .select()
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle(),
    readAll((from, to) =>
      supabase
        .from("visits")
        .select()
        .eq("project_id", id)
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("items")
        .select()
        .eq("project_id", id)
        .eq("user_id", userId)
        .order("number")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("evidence")
        .select()
        .eq("project_id", id)
        .eq("user_id", userId)
        .order("sequence")
        .range(from, to),
    ),
  ]);
  if (results[0].error)
    throw new Error(
      "Could not load project. Check your connection and migrations, then retry.",
    );
  const [p, v, i, e] = results;
  if (!p.data) notFound();
  return {
    project: p.data,
    visits: v,
    items: i,
    evidence: e,
  };
}
export async function signedImage(path: string | null) {
  if (!path) return null;
  const { supabase, userId } = await requireUser();
  if (!path.startsWith(`${userId}/`)) return null;
  const { data, error } = await supabase.storage
    .from("sitescribe")
    .createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}
export async function verifyImage(
  path: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
) {
  if (!new RegExp(`^${userId}/[a-f0-9-]{36}\\.(png|jpg)$`).test(path))
    return false;
  const { data, error } = await supabase.storage
    .from("sitescribe")
    .download(path);
  if (error || !data || data.size > MAX_FILE_BYTES || data.size === 0)
    return false;
  return validImage(
    new Uint8Array(await data.arrayBuffer()),
    path.endsWith(".png") ? "image/png" : "image/jpeg",
  );
}
