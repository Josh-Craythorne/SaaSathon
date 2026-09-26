import Link from "next/link";
import { signedImage } from "@/lib/sitescribe-server";
import { ref, type Evidence, type Item } from "@/lib/sitescribe";
import { PinImage } from "./capture";
import { Status } from "./shell";
export async function EvidenceCard({
  item,
  evidence: e,
}: {
  item: Item;
  evidence: Evidence;
}) {
  const url = await signedImage(e.photo_path);
  return (
    <article className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">
          {ref(item.number)} · {e.category}
        </span>
        <Status value={e.status} />
      </div>
      <h3 className="text-lg font-semibold">{e.title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-charcoal">
        {e.raw_notes}
      </p>
      {url ? (
        <div className="mt-5 max-w-xl">
          <PinImage
            src={url}
            point={e.photo_marker}
            number={item.number}
            label={`${ref(item.number)} photo evidence`}
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-charcoal/60">
          {e.photo_path
            ? "Image could not load. Refresh to renew private access."
            : "No photo supplied"}
        </p>
      )}
      <dl className="mt-5 grid gap-3 border-t border-black/10 pt-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-charcoal/50">Action required</dt>
          <dd className="mt-1">{e.action_required || "Not supplied"}</dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal/50">
            Responsibility · due date
          </dt>
          <dd className="mt-1">
            {e.responsible || "Not supplied"} · {e.due_date || "No date"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal/50">Location</dt>
          <dd className="mt-1">
            {e.drawing_reference}{" "}
            {e.location || (!e.drawing_pin && "Not supplied")}
            {e.drawing_pin && ` · pin ${item.number}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal/50">Priority</dt>
          <dd className="mt-1">{e.priority}</dd>
        </div>
      </dl>
      <Link
        href={`/projects/${e.project_id}/visits/${e.visit_id}?item=${item.id}#capture`}
        className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
      >
        Add follow-up / change status →
      </Link>
    </article>
  );
}
