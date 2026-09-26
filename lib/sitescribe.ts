import { z } from "zod";

export const statuses = ["Open", "In progress", "Resolved"] as const;
export const categories = [
  "Civil",
  "Structural",
  "Geotechnical",
  "General",
] as const;
export const priorities = ["Routine", "Priority", "Urgent"] as const;
const short = z.string().trim().max(240);
const notes = z.string().trim().max(10000);
const date = z.iso.date();
export const projectSchema = z.object({
  name: short.min(1),
  reference: short.min(1),
  address: short.min(1),
  client: short.min(1),
});
export const visitSchema = z.object({
  project_id: z.uuid(),
  date,
  engineer: short.min(1),
  weather: short,
  scope: notes,
  limitations: notes,
});
export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Point = z.infer<typeof pointSchema>;
export const observationSchema = z
  .object({
    visit_id: z.uuid(),
    item_id: z.union([z.uuid(), z.literal("")]),
    request_id: z.uuid(),
    title: short.min(1),
    raw_notes: notes.min(1),
    category: z.enum(categories),
    priority: z.enum(priorities),
    action_required: notes,
    responsible: short,
    due_date: z.union([date, z.literal("")]),
    status: z.enum(statuses),
    photo_path: z.string().max(300),
    photo_marker: pointSchema.nullable(),
    drawing_pin: pointSchema.nullable(),
    expected_drawing_path: z.string().max(300).default(""),
    location: short,
  })
  .refine((v) => !v.photo_marker || !!v.photo_path, {
    message: "A photo marker needs a photo.",
  });
export type Project = z.infer<typeof projectSchema> & {
  id: string;
  user_id: string;
  drawing_path: string | null;
  drawing_reference: string;
  demo: boolean;
  created_at: string;
};
export type Visit = z.infer<typeof visitSchema> & {
  id: string;
  user_id: string;
  created_at: string;
};
export type Item = {
  id: string;
  user_id: string;
  project_id: string;
  number: number;
  title: string;
  created_at: string;
};
export type Evidence = Omit<
  z.infer<typeof observationSchema>,
  "request_id" | "due_date" | "expected_drawing_path"
> & {
  id: string;
  user_id: string;
  project_id: string;
  due_date: string | null;
  drawing_path: string | null;
  drawing_reference: string;
  created_at: string;
  sequence: number;
};
export type ReportData = {
  project: Project;
  visit: Visit;
  summary: string;
  closing?: string;
  register?: { item: Item; evidence: Evidence }[];
  observations: {
    item: Item;
    evidence: Evidence;
    prose: string;
    history?: Evidence[];
    previous?: Evidence | null;
  }[];
  outstanding: { item: Item; evidence: Evidence }[];
};
export type Report = {
  id: string;
  user_id: string;
  project_id: string;
  visit_id: string;
  snapshot: ReportData;
  state: "Draft" | "Reviewed";
  version: number;
  source_report_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};
export type ActionState = { error?: string; success?: string; id?: string };
export const ref = (n: number) => `OBS-${String(n).padStart(3, "0")}`;
export function latestEvidence(evidence: Evidence[]) {
  const result = new Map<string, Evidence>();
  for (const e of evidence)
    if (!result.has(e.item_id) || result.get(e.item_id)!.sequence < e.sequence)
      result.set(e.item_id, e);
  return result;
}
export function assembleReport(
  project: Project,
  visit: Visit,
  items: Item[],
  evidence: Evidence[],
): ReportData {
  const byVisit = latestEvidence(
    evidence.filter((e) => e.visit_id === visit.id),
  );
  const latest = latestEvidence(evidence);
  const observations = items
    .filter((i) => byVisit.has(i.id))
    .sort((a, b) => a.number - b.number)
    .map((item) => ({
      item,
      evidence: byVisit.get(item.id)!,
      prose: byVisit.get(item.id)!.raw_notes,
      previous:
        evidence
          .filter(
            (e) =>
              e.item_id === item.id &&
              e.visit_id !== visit.id &&
              e.sequence <
                Math.min(
                  ...evidence
                    .filter(
                      (v) => v.item_id === item.id && v.visit_id === visit.id,
                    )
                    .map((v) => v.sequence),
                ),
          )
          .sort((a, b) => b.sequence - a.sequence)[0] ?? null,
      history: evidence.filter(
        (e) =>
          e.visit_id === visit.id &&
          e.item_id === item.id &&
          e.id !== byVisit.get(item.id)!.id,
      ),
    }));
  const outstanding = items
    .filter((i) => latest.has(i.id) && latest.get(i.id)!.status !== "Resolved")
    .map((item) => ({ item, evidence: latest.get(item.id)! }));
  const register = items
    .filter((i) => latest.has(i.id))
    .sort((a, b) => a.number - b.number)
    .map((item) => ({ item, evidence: latest.get(item.id)! }));
  const result: ReportData = {
    project,
    visit,
    register,
    summary: `${observations.length} ${observations.length === 1 ? "item" : "items"} recorded during this visit. ${outstanding.length} ${outstanding.length === 1 ? "item" : "items"} outstanding at report assembly.`,
    observations,
    outstanding,
  };
  const findings = observations
    .slice(0, 5)
    .map(
      (o) =>
        `${ref(o.item.number)}: ${o.evidence.title} (${o.evidence.status.toLowerCase()})`,
    )
    .join("; ");
  result.summary = `This report records the site visit to ${project.name} on ${visit.date}, recorded by ${visit.engineer}. ${visit.scope ? `The recorded visit scope was: ${visit.scope}` : "The purpose and scope of the visit were not recorded."}

${findings ? `Recorded findings include ${findings}.${observations.length > 5 ? " Further observations are set out in section 3." : ""}` : "No observations were recorded for this visit; this does not establish that no issues were present."}

${outstanding.length} project ${outstanding.length === 1 ? "item remains" : "items remain"} recorded as outstanding at report assembly. Section 5 consolidates the recorded actions, responsibilities and due dates; an empty field means not recorded.`;
  result.closing = closingSummary(result);
  return structuredClone(result);
}
export function actionRegister(data: ReportData) {
  if (data.register) return data.register;
  // Older snapshots contain only visit observations and the outstanding register.
  const rows = new Map(
    data.observations.map((o) => [
      o.item.id,
      { item: o.item, evidence: o.evidence },
    ]),
  );
  for (const row of data.outstanding) rows.set(row.item.id, row);
  return [...rows.values()].sort((a, b) => a.item.number - b.item.number);
}
export function closingSummary(data: ReportData) {
  const open = actionRegister(data).filter(
    (r) => r.evidence.status !== "Resolved",
  );
  const actions = open.filter((r) => r.evidence.action_required.trim());
  const nextSteps = actions.length
    ? `Recorded next steps are the actions listed for ${actions.slice(0, 10).map((r) => ref(r.item.number)).join(", ")}${actions.length > 10 ? " and the remaining entries in section 5" : ""}.`
    : "Action requirements for these outstanding items have not been recorded.";
  return `${
    open.length
      ? `${open.length} project ${open.length === 1 ? "item remains" : "items remain"} recorded as outstanding at assembly. ${nextSteps}`
      : "No project items are recorded as outstanding in this snapshot. This is a statement of the recorded register, not a conclusion about site conditions."
  }

Any gaps in the recorded information are listed below. Unrecorded actions, responsibilities or dates must not be read as confirmation that none apply. Later evidence and report versions do not alter this snapshot.`;
}
export function progressLabel(o: ReportData["observations"][number]) {
  if (o.evidence.status === "Resolved") return "Recorded as resolved";
  if (o.previous === null) return "New observation";
  if (o.previous?.status === "Resolved") return "Reopened item";
  if (o.previous) return "Ongoing item";
  return "Earlier progress not recorded";
}
export const reportReference = (data: ReportData) =>
  `${data.project.reference} / SV-${data.visit.date.replaceAll("-", "")}-${data.visit.id.slice(0, 8).toUpperCase()}`;

export function missingInformation(data: ReportData) {
  return [
    !data.visit.scope && "Visit scope",
    !data.visit.limitations && "Visit limitations",
    !data.visit.weather && "Weather",
    !data.observations.length && "Visit observations",
    ...data.observations.flatMap(({ item, evidence: e, history }) => [
      !e.photo_path &&
        !history?.some((previous) => previous.photo_path) &&
        `${ref(item.number)}: photo evidence`,
      !e.location && !e.drawing_pin && `${ref(item.number)}: drawing location`,
      !e.action_required && `${ref(item.number)}: action required`,
      !e.responsible && `${ref(item.number)}: responsible party`,
    ]),
  ].filter((x): x is string => !!x);
}
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export function validImage(bytes: Uint8Array, mime: string) {
  return (
    (mime === "image/png" &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) ||
    (mime === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255)
  );
}
