import Link from "next/link";
import { projectData, signedImage } from "@/lib/sitescribe-server";
import { requireUser } from "@/lib/auth";
import { latestEvidence, ref } from "@/lib/sitescribe";
import { Heading, Status } from "@/components/sitescribe/shell";
import { Button } from "@/components/ui/button";
import { DrawingForm } from "@/components/sitescribe/upload";
import { ItemFilter } from "@/components/sitescribe/item-filter";
import { PinImage } from "@/components/sitescribe/capture";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, visits, items, evidence } = await projectData(projectId);
  const latest = latestEvidence(evidence);
  const unresolved = items.filter(
    (i) => latest.get(i.id)?.status !== "Resolved",
  );
  const drawing = await signedImage(project.drawing_path);
  const { supabase } = await requireUser();
  const { data: reports, error } = await supabase
    .from("reports")
    .select("id,visit_id,state,created_at,version")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load report history.");
  return (
    <main id="main" className="workspace">
      <Link href="/projects" className="back-link">
        ← Projects
      </Link>
      <Heading
        eyebrow={`${project.reference}${project.demo ? " · Fictional demo" : ""}`}
        title={project.name}
        description={`${project.address} · ${project.client}`}
      >
        <Button asChild size="xl">
          <Link href={`/projects/${project.id}/visits/new`}>
            + Start site visit
          </Link>
        </Button>
      </Heading>
      <div className="mb-8 grid grid-cols-3 gap-3">
        <div className="stat">
          <span>Site visits</span>
          <strong>{visits.length}</strong>
        </div>
        <div className="stat">
          <span>Outstanding</span>
          <strong>{unresolved.length}</strong>
        </div>
        <div className="stat">
          <span>Resolved</span>
          <strong>{items.length - unresolved.length}</strong>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section id="visits" className="panel">
            <h2 className="section-title">Site visits</h2>
            {visits.length ? (
              visits.map((v) => (
                <Link
                  key={v.id}
                  href={`/projects/${project.id}/visits/${v.id}`}
                  className="list-row"
                >
                  <div>
                    <strong className="text-sm">{v.date}</strong>
                    <p className="mt-1 text-xs text-charcoal/60">
                      {v.engineer} ·{" "}
                      {evidence.filter((e) => e.visit_id === v.id).length}{" "}
                      evidence records
                    </p>
                  </div>
                  <span>↗</span>
                </Link>
              ))
            ) : (
              <p className="empty-copy">
                No visits yet. Start a site visit to capture observations.
              </p>
            )}
          </section>
          <section id="items" className="panel">
            <h2 className="section-title">Outstanding items</h2>
            <ItemFilter
              items={items.map((i) => ({
                id: i.id,
                number: i.number,
                title: latest.get(i.id)?.title ?? i.title,
                status: latest.get(i.id)?.status ?? "Open",
                href: `/projects/${project.id}/visits/${visits[0]?.id}?item=${i.id}#capture`,
              }))}
            />
            <h3 className="section-title mt-8">Item history</h3>
            <p className="mb-5 text-xs text-charcoal/60">
              Stable references, from the first record through every follow-up.
            </p>
            {items.length ? (
              items.map((item) => {
                const e = latest.get(item.id);
                return (
                  <details
                    key={item.id}
                    className="border-t border-black/10 py-4"
                  >
                    <summary className="cursor-pointer text-sm">
                      <span className="mr-3 font-mono text-xs">
                        {ref(item.number)}
                      </span>
                      {item.title}
                      <span className="ml-3 inline-block">
                        <Status value={e?.status ?? "Open"} />
                      </span>
                    </summary>
                    <div className="mt-4 space-y-3 border-l-2 border-blue/30 pl-4">
                      {evidence
                        .filter((ev) => ev.item_id === item.id)
                        .map((ev) => (
                          <div key={ev.id} className="text-sm">
                            <Link
                              href={`/projects/${project.id}/visits/${ev.visit_id}?item=${item.id}#capture`}
                              className="font-medium underline underline-offset-4"
                            >
                              {visits.find((v) => v.id === ev.visit_id)?.date} ·{" "}
                              {ev.status}
                            </Link>
                            <p className="mt-1 whitespace-pre-wrap leading-6 text-charcoal/70">
                              {ev.raw_notes}
                            </p>
                          </div>
                        ))}
                    </div>
                  </details>
                );
              })
            ) : (
              <p className="empty-copy">No observations recorded yet.</p>
            )}
          </section>
          <section id="reports" className="panel">
            <h2 className="section-title">Report versions</h2>
            {reports?.length ? (
              reports.map((r) => (
                <Link
                  key={r.id}
                  href={`/projects/${project.id}/reports/${r.id}`}
                  className="list-row"
                >
                  <div>
                    <span className="text-sm">
                      Visit {visits.find((v) => v.id === r.visit_id)?.date} ·
                      Version {r.version}
                    </span>
                    <p className="mt-1 text-xs text-charcoal/60">
                      Saved{" "}
                      {new Date(r.created_at)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}{" "}
                      UTC
                    </p>
                  </div>
                  <Status value={r.state} />
                </Link>
              ))
            ) : (
              <p className="empty-copy">
                Generate a report from a visit. Every saved version is retained.
              </p>
            )}
          </section>
        </div>
        <aside className="panel space-y-6">
          <div>
            <p className="eyebrow">Site orientation</p>
            <h2 className="mt-2 section-title">Project drawing</h2>
            <p className="text-xs leading-5 text-charcoal/60">
              One PNG/JPEG drawing. Replacements apply to new evidence; earlier
              records retain their drawing revision.
            </p>
          </div>
          {drawing && (
            <>
              <PinImage
                src={drawing}
                point={null}
                number={0}
                label="Project drawing"
              />
              <p className="text-sm">{project.drawing_reference}</p>
            </>
          )}
          <details open={!drawing}>
            <summary className="mb-4 cursor-pointer text-sm font-medium">
              {drawing ? "Replace drawing" : "Upload your drawing"}
            </summary>
            <DrawingForm projectId={project.id} />
          </details>
        </aside>
      </div>
    </main>
  );
}
