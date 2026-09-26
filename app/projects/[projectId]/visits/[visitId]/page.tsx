import { ItemFilter } from "@/components/sitescribe/item-filter";
import Link from "next/link";
import { notFound } from "next/navigation";
import { projectData, signedImage } from "@/lib/sitescribe-server";
import { latestEvidence } from "@/lib/sitescribe";
import { Heading } from "@/components/sitescribe/shell";
import { Capture } from "@/components/sitescribe/capture";
import { EvidenceCard } from "@/components/sitescribe/evidence-card";
import { GenerateButton } from "@/components/sitescribe/forms";
export default async function VisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; visitId: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { projectId, visitId } = await params;
  const { item: itemId } = await searchParams;
  const { project, visits, items, evidence } = await projectData(projectId);
  const visit = visits.find((v) => v.id === visitId);
  if (!visit) notFound();
  const latest = latestEvidence(evidence);
  const selected = items.find((i) => i.id === itemId);
  if (itemId && !selected) notFound();
  const selectedEvidence = selected ? latest.get(selected.id) : undefined;
  const current = latestEvidence(
    evidence.filter((e) => e.visit_id === visitId),
  );
  const drawing = await signedImage(project.drawing_path);
  return (
    <main id="main" className="workspace">
      <Link href={`/projects/${project.id}`} className="back-link">
        ← {project.name}
      </Link>
      <Heading
        eyebrow={`${project.reference} / Site visit${project.demo ? " · Fictional demo" : ""}`}
        title={`Site visit · ${visit.date}`}
        description={`${visit.engineer}${visit.weather ? ` · ${visit.weather}` : ""}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <a href="#capture" className="back-link">
            Add observation
          </a>
          <a href="#register" className="back-link">
            Follow up
          </a>
          <GenerateButton projectId={project.id} visitId={visit.id} />
        </div>
      </Heading>
      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-black/10 py-4 text-sm">
        <span>
          <strong>{current.size}</strong> items recorded this visit
        </span>
        <span>
          <strong>
            {
              items.filter((i) => latest.get(i.id)?.status !== "Resolved")
                .length
            }
          </strong>{" "}
          currently outstanding
        </span>
        <span className="text-charcoal/60">
          Saved evidence stays linked to this visit
        </span>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <div id="capture" className="scroll-mt-5">
            <div className="capture-context">
              <strong>{project.reference}</strong>
              <span>
                Visit {visit.date} · {visit.engineer}
              </span>
            </div>
            <Capture
              key={`${visit.id}-${selected?.id ?? "new"}`}
              visitId={visit.id}
              drawingUrl={drawing}
              drawingReference={project.drawing_reference}
              drawingPath={project.drawing_path}
              nextNumber={Math.max(0, ...items.map((i) => i.number)) + 1}
              existing={
                selected && selectedEvidence
                  ? { item: selected, evidence: selectedEvidence }
                  : undefined
              }
            />
            {selected && (
              <Link
                href={`/projects/${project.id}/visits/${visit.id}#capture`}
                className="mt-3 inline-block text-sm underline"
              >
                ← Capture a new observation
              </Link>
            )}
          </div>
          <h2 className="section-title">Visit evidence</h2>
          {current.size ? (
            evidence
              .filter((e) => e.visit_id === visit.id)
              .map((e) => (
                <EvidenceCard
                  key={e.id}
                  item={items.find((i) => i.id === e.item_id)!}
                  evidence={e}
                />
              ))
          ) : (
            <div className="panel py-12">
              <p className="eyebrow">Ready when you are</p>
              <h3 className="mt-3 text-xl font-semibold">
                No observations yet.
              </h3>
              <p className="mt-3 text-sm leading-6 text-charcoal/60">
                Add a photo, dictate or type your notes, and select your
                classification. Save your observation when ready, then review
                the report.
              </p>
            </div>
          )}
        </div>
        <aside className="space-y-5">
          <section id="register" className="panel">
            <h2 className="section-title">Project item register</h2>
            <p className="mb-4 text-xs leading-5 text-charcoal/60">
              Follow up, resolve or reopen an item in this visit. Its original
              reference stays the same.
            </p>
            <ItemFilter
              items={items.map((i) => ({
                id: i.id,
                number: i.number,
                title: i.title,
                status: latest.get(i.id)?.status ?? "Open",
                href: `/projects/${project.id}/visits/${visit.id}?item=${i.id}#capture`,
              }))}
            />
          </section>
          <section className="panel text-sm">
            <h2 className="section-title">Visit context</h2>
            <p className="eyebrow">Scope</p>
            <p className="mt-2 mb-5 whitespace-pre-wrap leading-6">
              {visit.scope || "Not supplied"}
            </p>
            <p className="eyebrow">Limitations</p>
            <p className="mt-2 whitespace-pre-wrap leading-6">
              {visit.limitations || "Not supplied"}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
