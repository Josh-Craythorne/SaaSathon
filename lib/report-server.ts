import "server-only";
import { isDeepStrictEqual } from "node:util";
import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { idSchema } from "./validation";
import { signedImage } from "./sitescribe-server";
import type { ReportData, Report } from "./sitescribe";

export async function loadReport(projectId: string, reportId: string) {
  if (
    !idSchema.safeParse(projectId).success ||
    !idSchema.safeParse(reportId).success
  )
    notFound();
  const { supabase, userId } = await requireUser();
  const { data: report, error } = await supabase
    .from("reports")
    .select()
    .eq("id", reportId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load report. Try again.");
  if (!report) notFound();
  const paths = [
    ...new Set(
      report.snapshot.observations
        .flatMap((o) =>
          [o.evidence, ...(o.history ?? [])].flatMap((e) => [
            e.photo_path,
            e.drawing_pin ? e.drawing_path : null,
          ]),
        )
        .filter((p): p is string => !!p),
    ),
  ];
  const entries = await Promise.all(
    paths.map(async (p) => [p, await signedImage(p)] as const),
  );
  return { report, images: Object.fromEntries(entries) };
}

// A stable request UUID is the new row ID. Retries return the same persisted version.
export async function persistReport(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  input: {
    id: string;
    user_id: string;
    project_id: string;
    visit_id: string;
    source_report_id: string | null;
    snapshot: ReportData;
    state: Report["state"];
  },
) {
  try {
    const { data, error } = await supabase
      .from("reports")
      .insert({
        ...input,
        reviewed_at:
          input.state === "Reviewed" ? new Date().toISOString() : null,
      })
      .select("id,state")
      .single();
    if (!error) return data;
    if (error.code !== "23505") return null;
    const { data: existing } = await supabase
      .from("reports")
      .select()
      .eq("id", input.id)
      .eq("user_id", input.user_id)
      .maybeSingle();
    if (
      existing &&
      existing.source_report_id === input.source_report_id &&
      existing.project_id === input.project_id &&
      existing.visit_id === input.visit_id &&
      existing.state === input.state &&
      isDeepStrictEqual(existing.snapshot, input.snapshot)
    )
      return { id: existing.id, state: existing.state };
    return null;
  } catch {
    return null;
  }
}
