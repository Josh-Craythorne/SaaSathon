"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { persistReport } from "@/lib/report-server";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/lib/validation";
import {
  projectSchema,
  visitSchema,
  observationSchema,
  assembleReport,
  MAX_FILE_BYTES,
  type ActionState,
} from "@/lib/sitescribe";
import { projectData, verifyImage } from "@/lib/sitescribe-server";
import type { Json } from "@/lib/database.types";

export async function createProject(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, user_id: userId })
    .select("id")
    .single();
  if (error)
    return {
      error: "Project was not saved. Check the database setup and try again.",
    };
  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}
export async function createVisit(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const parsed = visitSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await supabase
    .from("visits")
    .insert({ ...parsed.data, user_id: userId })
    .select("id")
    .single();
  if (error)
    return { error: "Visit was not saved. Check the project and try again." };
  revalidatePath(`/projects/${parsed.data.project_id}`);
  redirect(`/projects/${parsed.data.project_id}/visits/${data.id}`);
}
export async function prepareUpload(input: unknown) {
  const { supabase, userId } = await requireUser();
  const parsed = z
    .object({
      type: z.enum(["image/png", "image/jpeg"]),
      size: z.number().int().positive().max(MAX_FILE_BYTES),
    })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Choose a PNG or JPEG image up to 8 MB." };
  const filePath = `${userId}/${crypto.randomUUID()}.${parsed.data.type === "image/png" ? "png" : "jpg"}`;
  const { data, error } = await supabase.storage
    .from("sitescribe")
    .createSignedUploadUrl(filePath);
  if (error)
    return {
      error: "Could not start upload. Check your connection and try again.",
    };
  return { path: filePath, url: data.signedUrl };
}
export async function saveDrawing(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const p = z
    .object({
      project_id: z.uuid(),
      drawing_path: z.string().max(300),
      drawing_reference: z.string().trim().min(1).max(240),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success)
    return { error: "Upload a drawing and enter its reference/revision." };
  if (!(await verifyImage(p.data.drawing_path, userId, supabase)))
    return {
      error:
        "Drawing upload is missing or invalid. Upload a PNG or JPEG again.",
    };
  const { data, error } = await supabase
    .from("projects")
    .update({
      drawing_path: p.data.drawing_path,
      drawing_reference: p.data.drawing_reference,
    })
    .eq("id", p.data.project_id)
    .eq("user_id", userId)
    .select("id")
    .single();
  if (error || !data) return { error: "Drawing was not saved. Try again." };
  revalidatePath(`/projects/${p.data.project_id}`, "layout");
  return {
    success:
      "Drawing saved. Earlier evidence retains its original drawing and reference.",
  };
}
export async function saveObservation(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  let value;
  try {
    value = {
      ...Object.fromEntries(form),
      photo_marker: JSON.parse(String(form.get("photo_marker") || "null")),
      drawing_pin: JSON.parse(String(form.get("drawing_pin") || "null")),
    };
  } catch {
    return { error: "Invalid marker position. Place the marker again." };
  }
  const p = observationSchema.safeParse(value);
  if (!p.success) return { error: p.error.issues[0].message };
  if (
    p.data.photo_path &&
    !(await verifyImage(p.data.photo_path, userId, supabase))
  )
    return {
      error:
        "Photo upload is missing or invalid. Upload the photo again; your notes are still here.",
    };
  const { data, error } = await supabase.rpc("save_observation", {
    p: p.data as Json,
  });
  if (error)
    return {
      error: error.message.includes("drawing changed")
        ? "The project drawing changed while you were capturing. Copy your notes, reload this visit, and place the pin on the new drawing before saving."
        : "Observation was not saved. Check the visit, classification and drawing, then retry.",
    };
  revalidatePath("/projects", "layout");
  return {
    success: "Observation saved. Evidence and status history preserved.",
    id: data,
  };
}
export async function generateReport(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const p = z
    .object({ project_id: z.uuid(), visit_id: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Invalid visit." };
  const context = await projectData(p.data.project_id);
  const visit = context.visits.find((v) => v.id === p.data.visit_id);
  if (!visit) return { error: "Visit not found." };
  const snapshot = assembleReport(
    context.project,
    visit,
    context.items,
    context.evidence,
  );
  const { data, error } = await supabase
    .from("reports")
    .insert({
      project_id: context.project.id,
      visit_id: visit.id,
      user_id: userId,
      snapshot,
      state: "Draft",
    })
    .select("id")
    .single();
  if (error)
    return { error: "Report could not be generated. Retry when connected." };
  redirect(`/projects/${context.project.id}/reports/${data.id}`);
}
export async function saveReport(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const id = idSchema.safeParse(form.get("id"));
  const summary = z
    .string()
    .trim()
    .min(1)
    .max(20000)
    .safeParse(form.get("summary"));
  const closing = z
    .string()
    .trim()
    .min(1)
    .max(20000)
    .safeParse(form.get("closing"));
  const intent = z.enum(["draft", "review"]).safeParse(form.get("intent"));
  const requestId = idSchema.safeParse(
    form.get(
      intent.success && intent.data === "review"
        ? "review_request_id"
        : "draft_request_id",
    ),
  );
  if (
    !id.success ||
    !summary.success ||
    !closing.success ||
    !intent.success ||
    !requestId.success
  )
    return {
      error:
        "Enter an executive and closing summary (up to 20,000 characters each), then retry.",
    };
  if (intent.data === "review" && form.get("reviewed") !== "on")
    return {
      error: "Confirm you have reviewed the report and its evidence first.",
    };
  const { data: old, error: readError } = await supabase
    .from("reports")
    .select()
    .eq("id", id.data)
    .eq("user_id", userId)
    .single();
  if (readError) return { error: "Report not found." };
  if (old.state !== "Draft")
    return {
      error:
        "This reviewed snapshot is locked. Create a new draft before editing.",
    };
  const snapshot = structuredClone(old.snapshot);
  snapshot.summary = summary.data;
  snapshot.closing = closing.data;
  for (const o of snapshot.observations) {
    const prose = z
      .string()
      .trim()
      .min(1)
      .max(10000)
      .safeParse(form.get(`prose_${o.item.id}`));
    if (!prose.success)
      return {
        error: "Each observation needs report prose (up to 10,000 characters).",
      };
    o.prose = prose.data;
  }
  const reviewed = intent.data === "review";
  const data = await persistReport(supabase, {
    id: requestId.data,
    user_id: userId,
    project_id: old.project_id,
    visit_id: old.visit_id,
    source_report_id: old.id,
    snapshot,
    state: reviewed ? "Reviewed" : "Draft",
  });
  if (!data)
    return {
      error:
        "Report version was not saved. Your edits are still here. Check your connection and retry.",
    };
  revalidatePath(`/projects/${old.project_id}`, "layout");
  redirect(
    `/projects/${old.project_id}/reports/${data.id}${reviewed ? "/view?saved=1" : ""}`,
  );
}
export async function createReportDraft(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const parsed = z
    .object({ id: z.uuid(), request_id: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Invalid report. Refresh and try again." };
  const { data: source, error } = await supabase
    .from("reports")
    .select()
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !source)
    return { error: "Report could not be loaded. Try again." };
  if (source.state !== "Reviewed")
    return { error: "Open the draft editor to continue editing this report." };
  const data = await persistReport(supabase, {
    id: parsed.data.request_id,
    user_id: userId,
    project_id: source.project_id,
    visit_id: source.visit_id,
    source_report_id: source.id,
    snapshot: structuredClone(source.snapshot),
    state: "Draft",
  });
  if (!data)
    return {
      error:
        "The new draft was not saved. Your reviewed snapshot is unchanged; retry when connected.",
    };
  revalidatePath(`/projects/${source.project_id}`, "layout");
  redirect(`/projects/${source.project_id}/reports/${data.id}`);
}

export async function loadDemo(): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const { data: existing, error: readError } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("demo", true)
    .maybeSingle();
  if (readError)
    return { error: "Apply the SiteScribe migration before loading the demo." };
  if (existing) redirect(`/projects/${existing.id}`);
  const paths: string[] = [];
  for (const name of ["drawing", "foundation", "drainage", "retaining"]) {
    const filePath = `${userId}/${crypto.randomUUID()}.png`;
    const bytes = await readFile(
      path.join(process.cwd(), "public", "demo", `${name}.png`),
    );
    const { error } = await supabase.storage
      .from("sitescribe")
      .upload(filePath, bytes, { contentType: "image/png", upsert: false });
    if (error)
      return {
        error:
          "Demo image upload failed. Check storage setup and retry. No existing project was changed.",
      };
    paths.push(filePath);
  }
  const { data, error } = await supabase.rpc("load_sitescribe_demo", { paths });
  if (error)
    return { error: "Demo could not be saved. Check migrations and retry." };
  revalidatePath("/projects");
  redirect(`/projects/${data}`);
}
