"use client";
/* eslint-disable @next/next/no-img-element */
import { useActionState, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { saveObservation } from "@/app/projects/actions";
import {
  statuses,
  categories,
  priorities,
  ref,
  type Point,
  type Item,
  type Evidence,
} from "@/lib/sitescribe";
import { Field, Feedback } from "./forms";
import { UploadImage } from "./upload";
import { Dictation } from "./dictation";
import { appendTranscript } from "@/lib/dictation";
import { useUnsaved, confirmDiscard } from "./unsaved";

export function PinImage({
  src,
  point,
  onPoint,
  number,
  label,
}: {
  src: string;
  point: Point | null;
  onPoint?: (p: Point | null) => void;
  number: number;
  label: string;
}) {
  const picture = (
    <>
      <img src={src} alt={label} className="block h-auto w-full" />
      {point && (
        <span
          className="pin"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        >
          {number}
        </span>
      )}
    </>
  );
  return (
    <div className="space-y-2">
      {onPoint ? (
        <>
          <button
            type="button"
            aria-label={`Place ${label} marker. Tap image, or press Enter to place at center.`}
            className="relative block w-full overflow-hidden rounded-xl border border-black/10 text-left"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onPoint(
                e.detail === 0
                  ? { x: 0.5, y: 0.5 }
                  : {
                      x: Math.min(
                        1,
                        Math.max(0, (e.clientX - r.left) / r.width),
                      ),
                      y: Math.min(
                        1,
                        Math.max(0, (e.clientY - r.top) / r.height),
                      ),
                    },
              );
            }}
          >
            {picture}
          </button>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>Tap to place or move marker {number}.</span>
            {point && (
              <>
                <label>
                  X %{" "}
                  <input
                    aria-label={`${label} marker X percent`}
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(point.x * 100)}
                    onChange={(e) =>
                      onPoint({
                        ...point,
                        x:
                          Math.min(100, Math.max(0, Number(e.target.value))) /
                          100,
                      })
                    }
                    className="w-14 rounded border p-1"
                  />
                </label>
                <label>
                  Y %{" "}
                  <input
                    aria-label={`${label} marker Y percent`}
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(point.y * 100)}
                    onChange={(e) =>
                      onPoint({
                        ...point,
                        y:
                          Math.min(100, Math.max(0, Number(e.target.value))) /
                          100,
                      })
                    }
                    className="w-14 rounded border p-1"
                  />
                </label>
                <button
                  type="button"
                  className="underline"
                  onClick={() => onPoint(null)}
                >
                  Remove marker
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-black/10">
          {picture}
        </div>
      )}
    </div>
  );
}
type CaptureProps = {
  visitId: string;
  drawingUrl: string | null;
  drawingReference: string;
  drawingPath: string | null;
  nextNumber: number;
  existing?: { item: Item; evidence: Evidence };
};
export function Capture(props: CaptureProps) {
  const [session, setSession] = useState(0);
  return (
    <CaptureForm
      key={session}
      {...props}
      onContinue={() => setSession((s) => s + 1)}
    />
  );
}
function CaptureForm({
  visitId,
  drawingUrl,
  drawingReference,
  drawingPath,
  nextNumber,
  existing,
  onContinue,
}: {
  onContinue: () => void;
  visitId: string;
  drawingUrl: string | null;
  drawingReference: string;
  drawingPath: string | null;
  nextNumber: number;
  existing?: { item: Item; evidence: Evidence };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveObservation, {});
  const [open, setOpen] = useState(!!existing);
  const [requestId] = useState(() => crypto.randomUUID());
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState({ path: "", url: "" });
  const [photoPoint, setPhotoPoint] = useState<Point | null>(null);
  const [drawingPoint, setDrawingPoint] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [insertError, setInsertError] = useState("");
  const notesRef = useRef(notes);
  useUnsaved(!state.success && (dirty || busy || dictating));
  const number = existing?.item.number ?? nextNumber;
  if (state.success)
    return (
      <section className="panel space-y-4 border-blue/40">
        <Feedback state={state} />
        <p className="text-sm">
          Your item is saved with its evidence. It is ready for the report.
        </p>
        <Button
          type="button"
          onClick={() => {
            router.refresh();
            onContinue();
          }}
        >
          Continue capturing
        </Button>
      </section>
    );
  if (!open)
    return (
      <Button
        size="xl"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Plus /> Add observation
      </Button>
    );
  return (
    <section className="panel border-blue/30">
      <div className="mb-6 flex justify-between gap-4">
        <div>
          <p className="eyebrow">
            {existing ? `${ref(number)} · Follow-up` : "New observation"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {existing ? "Record an update" : "Capture what you see."}
          </h2>
        </div>
        {!existing && (
          <Button
            variant="ghost"
            onClick={async () => {
              if (
                (!dirty && !dictating) ||
                (await confirmDiscard(
                  "Discard this unsaved observation and recording?",
                ))
              )
                onContinue();
            }}
          >
            Close
          </Button>
        )}
      </div>
      <form
        data-unsaved-form
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();

          if (pending || busy || dictating) return;
          const form = new FormData(e.currentTarget);
          startTransition(() => action(form));
        }}
        className="space-y-6"
      >
        <input type="hidden" name="visit_id" value={visitId} />
        <input
          type="hidden"
          name="expected_drawing_path"
          value={drawingPath ?? ""}
        />
        <input type="hidden" name="item_id" value={existing?.item.id ?? ""} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="photo_path" value={photo.path} />
        <input
          type="hidden"
          name="photo_marker"
          value={JSON.stringify(photoPoint)}
        />
        <input
          type="hidden"
          name="drawing_pin"
          value={JSON.stringify(drawingPoint)}
        />
        <fieldset disabled={pending} className="space-y-6">
          <Field
            name="title"
            label="Observation title"
            defaultValue={existing?.evidence.title ?? ""}
            required
          />
          <UploadImage
            label={
              existing
                ? "Follow-up photo (optional)"
                : "Photo evidence (optional)"
            }
            capture
            onBusy={setBusy}
            onUploaded={(path, url) => {
              setPhoto({ path, url });
              setDirty(true);
              setPhotoPoint(null);
            }}
          />
          {photo.url && (
            <PinImage
              src={photo.url}
              point={photoPoint}
              onPoint={(p) => {
                setPhotoPoint(p);
                setDirty(true);
              }}
              number={number}
              label="Photo"
            />
          )}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label
                htmlFor={`notes-${requestId}`}
                className="text-sm font-medium"
              >
                {existing ? "Follow-up notes" : "Raw site notes"}
              </label>
            </div>
            <Dictation
              visitId={visitId}
              onWork={setDictating}
              onInsert={(text) => {
                try {
                  const next = appendTranscript(notesRef.current, text);
                  notesRef.current = next;
                  setNotes(next);
                  setDirty(true);
                  setInsertError("");
                  return true;
                } catch (e) {
                  setInsertError((e as Error).message);
                  return false;
                }
              }}
            />
            {insertError && (
              <p role="alert" className="text-sm text-red-800">
                {insertError}
              </p>
            )}
            <textarea
              id={`notes-${requestId}`}
              name="raw_notes"
              value={notes}
              onChange={(e) => {
                notesRef.current = e.target.value;
                setNotes(e.target.value);
              }}
              required
              maxLength={10000}
              rows={5}
              placeholder="Describe what you observed, in your own words…"
              className={fieldClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["category", "Category", categories],
                ["priority", "Priority", priorities],
                ["status", "Status", statuses],
              ] as const
            ).map(([name, label, values]) => (
              <label key={name} className="space-y-2 text-sm font-medium">
                <span className="block">{label}</span>
                <select
                  name={name}
                  required
                  defaultValue={existing ? existing.evidence[name] : ""}
                  className={fieldClass}
                >
                  <option value="" disabled>
                    Select {label.toLowerCase()}
                  </option>
                  {values.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Field
            name="action_required"
            label="Action required"
            multiline
            maxLength={10000}
            defaultValue={existing?.evidence.action_required ?? ""}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="responsible"
              label="Responsible party"
              defaultValue={existing?.evidence.responsible ?? ""}
            />
            <Field
              name="due_date"
              label="Due date"
              type="date"
              defaultValue={existing?.evidence.due_date ?? ""}
            />
          </div>
          <div className="space-y-3 border-t border-black/10 pt-6">
            <h3 className="flex items-center gap-2 font-medium">
              <MapPin size={18} /> Drawing location
            </h3>
            {drawingUrl ? (
              <>
                <p className="text-sm text-charcoal/60">{drawingReference}</p>
                <PinImage
                  src={drawingUrl}
                  point={drawingPoint}
                  onPoint={(p) => {
                    setDrawingPoint(p);
                    setDirty(true);
                  }}
                  number={number}
                  label="Drawing"
                />
              </>
            ) : (
              <p className="rounded-xl bg-off-white p-4 text-sm">
                No drawing uploaded. Add a manual location below, or upload a
                drawing on the project page.
              </p>
            )}
            <Field
              name="location"
              label="Manual drawing reference / location"
              defaultValue={existing?.evidence.location ?? ""}
            />
          </div>
        </fieldset>
        <Feedback state={state} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="xl"
            type="submit"
            disabled={pending || busy || dictating}
          >
            {pending
              ? "Saving observation…"
              : busy
                ? "Waiting for upload…"
                : "Save observation"}
          </Button>
          <span className="text-xs text-charcoal/60">
            {pending
              ? "Pending · keep this page open"
              : dictating
                ? "Finish or cancel dictation before saving"
                : "Unsaved until confirmed"}
          </span>
        </div>
      </form>
    </section>
  );
}
