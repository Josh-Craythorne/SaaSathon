"use client";
import Link from "next/link";
import { useTransition, useActionState, useRef, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { saveReport } from "@/app/projects/actions";
import {
  closingSummary,
  ref,
  type Report,
  type ReportData,
} from "@/lib/sitescribe";
import { useUnsaved } from "./unsaved";
import { Feedback } from "./forms";
import { ReportDocument } from "./report-document";
import { ReportPrint } from "./report-controls";
export function ReportEditor({
  report,
  images,
}: {
  report: Report;
  images: Record<string, string | null>;
}) {
  const submitting = useRef(false);
  // Preserve the native Server Action form for progressive enhancement; catch
  // transport failures in the interactive flow so the controlled draft stays open.
  const [fallbackState, fallbackAction] = useActionState(saveReport, {});
  const [state, setState] = useState<Parameters<typeof saveReport>[0]>({});
  const [pending, startTransition] = useTransition();
  async function submit(form: FormData) {
    try {
      setState(await saveReport({}, form));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "digest" in error &&
        String(error.digest).startsWith("NEXT_REDIRECT")
      ) throw error;
      setState({
        error: "The save could not be confirmed. Your edits are still here. Check your connection and retry.",
      });
    } finally {
      submitting.current = false;
    }
  }
  const [draft, setDraft] = useState<ReportData>(() => ({
    ...report.snapshot,
    closing: report.snapshot.closing ?? closingSummary(report.snapshot),
  }));
  const [dirty, setDirty] = useState(!report.snapshot.closing);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [requests, setRequests] = useState(() => ({
    draft: crypto.randomUUID(),
    review: crypto.randomUUID(),
  }));
  useUnsaved(dirty && !pending);
  function change(next: ReportData) {
    setDraft(next);
    setDirty(true);
    setReviewChecked(false);
    setRequests({ draft: crypto.randomUUID(), review: crypto.randomUUID() });
  }
  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Draft review · Version {report.version}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Review site visit report
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal/70">
            Edit the narrative, check the recorded evidence and actions, then
            explicitly confirm review. Saving a reviewed snapshot opens the
            finished document.
          </p>
          {report.source_report_id && (
            <Link
              className="mt-3 inline-block text-sm underline"
              href={`/projects/${report.project_id}/reports/${report.source_report_id}`}
            >
              View source version
            </Link>
          )}
        </div>
        <ReportPrint
          disabled={dirty || pending}
          unavailable={Object.values(images).some((v) => !v)}
        />
      </div>
      <div className="report-layout">
        <aside className="no-print panel self-start">
          <h2 className="section-title">Report narrative</h2>
          <p className="mb-5 text-sm leading-6 text-charcoal/70">
            Original notes, classifications and private evidence stay unchanged.
            Preview your edits in the document.
          </p>
          <form
            data-unsaved-form
            action={fallbackAction}
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (submitting.current || pending) return;
              const submitter = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement | null;
              const form = new FormData(e.currentTarget);
              form.set("intent", submitter?.value || "draft");
              submitting.current = true;
              startTransition(() => submit(form));
            }}
          >
            <input type="hidden" name="id" value={report.id} />
            <input
              type="hidden"
              name="draft_request_id"
              value={requests.draft}
            />
            <input
              type="hidden"
              name="review_request_id"
              value={requests.review}
            />
            <fieldset disabled={pending} className="space-y-5">
              <label className="block space-y-2 text-sm font-medium">
                <span>Executive summary</span>
                <textarea
                  name="summary"
                  className={fieldClass}
                  rows={8}
                  required
                  maxLength={20000}
                  value={draft.summary}
                  onChange={(e) =>
                    change({ ...draft, summary: e.target.value })
                  }
                />
              </label>
              {draft.observations.map((o) => (
                <label
                  key={o.item.id}
                  className="block space-y-2 text-sm font-medium"
                >
                  <span>{ref(o.item.number)} · Report prose</span>
                  <textarea
                    name={`prose_${o.item.id}`}
                    className={fieldClass}
                    rows={5}
                    required
                    maxLength={10000}
                    value={o.prose}
                    onChange={(e) =>
                      change({
                        ...draft,
                        observations: draft.observations.map((v) =>
                          v.item.id === o.item.id
                            ? { ...v, prose: e.target.value }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <label className="block space-y-2 text-sm font-medium">
                <span>Closing summary</span>
                <textarea
                  name="closing"
                  className={fieldClass}
                  rows={7}
                  required
                  maxLength={20000}
                  value={draft.closing}
                  onChange={(e) =>
                    change({ ...draft, closing: e.target.value })
                  }
                />
              </label>
              <Button
                name="intent"
                value="draft"
                type="submit"
                variant="outline"
                className="w-full"
              >
                {pending ? "Saving version…" : "Save as new Draft"}
              </Button>
              <div className="space-y-4 border-t border-black/10 pt-5">
                <label className="flex gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    name="reviewed"
                    className="mt-1 size-5 shrink-0 accent-blue"
                    checked={reviewChecked}
                    onChange={(e) => setReviewChecked(e.target.checked)}
                  />
                  <span>
                    I have reviewed the narrative, evidence, classifications,
                    actions and missing information. I confirm the recorded
                    engineering judgments are mine. Review is not certification.
                  </span>
                </label>
                <Button
                  name="intent"
                  value="review"
                  type="submit"
                  className="w-full whitespace-normal"
                  disabled={!reviewChecked}
                >
                  <CheckCheck />
                  {pending
                    ? "Saving reviewed snapshot…"
                    : "Mark Reviewed & save snapshot"}
                </Button>
              </div>
            </fieldset>
            <Feedback state={state.error ? state : fallbackState} />
            <p className="text-xs leading-5 text-charcoal/70">
              {pending
                ? "Saving to your private workspace. Keep this page open."
                : dirty
                  ? "Unsaved narrative changes. Save before printing."
                  : "This draft is saved. Review confirmation is required to finish."}
            </p>
          </form>
        </aside>
        <ReportDocument
          report={report}
          data={draft}
          images={images}
          unsaved={dirty}
        />
      </div>
    </>
  );
}
