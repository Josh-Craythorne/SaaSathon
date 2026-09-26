"use client";
import { useActionState, useState } from "react";
import { Printer, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createReportDraft } from "@/app/projects/actions";
import { Feedback } from "./forms";

export function ReportPrint({
  disabled = false,
  unavailable = false,
}: {
  disabled?: boolean;
  unavailable?: boolean;
}) {
  const [printing, setPrinting] = useState(false),
    [error, setError] = useState("");
  async function print() {
    if (printing || disabled) return;
    setPrinting(true);
    setError("");
    try {
      if (unavailable) throw new Error("Missing images");
      await document.fonts.ready;
      await Promise.all(
        [
          ...document.querySelectorAll<HTMLImageElement>("#report-preview img"),
        ].map(async (img) => {
          await img.decode();
          if (!img.naturalWidth) throw new Error("Missing image");
        }),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      window.print();
    } catch {
      setError(
        "Printing paused: evidence could not load. Refresh to renew private image links and try again.",
      );
    } finally {
      setPrinting(false);
    }
  }
  return (
    <div className="no-print">
      <Button
        variant="outline"
        size="xl"
        disabled={disabled || printing}
        onClick={() => void print()}
      >
        <Printer />
        {printing ? "Preparing document…" : "Print / Save as PDF"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 max-w-sm text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
export function CreateReportDraft({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(createReportDraft, {});
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="no-print space-y-3">
      <input type="hidden" name="id" value={reportId} />
      <input type="hidden" name="request_id" value={requestId} />
      <Button size="xl" disabled={pending}>
        <FilePlus2 />
        {pending ? "Creating draft…" : "Create new draft"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
