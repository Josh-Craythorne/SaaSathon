import Link from "next/link";
import { projectData } from "@/lib/sitescribe-server";
import { latestEvidence, ref } from "@/lib/sitescribe";
import { VisitForm } from "@/components/sitescribe/forms";
import { Heading, Status } from "@/components/sitescribe/shell";
export default async function NewVisit({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, items, evidence } = await projectData(projectId);
  const latest = latestEvidence(evidence);
  const open = items.filter((i) => latest.get(i.id)?.status !== "Resolved");
  return (
    <main id="main" className="workspace max-w-3xl">
      <Link href={`/projects/${project.id}`} className="back-link">
        ← {project.name}
      </Link>
      <Heading
        eyebrow="02 / Site visit"
        title="Back on site."
        description="Record the visit context, then capture new observations or follow up on existing items."
      />
      {open.length > 0 && (
        <section className="panel mb-6">
          <h2 className="section-title">Outstanding from earlier visits</h2>
          {open.map((i) => (
            <div key={i.id} className="list-row">
              <span className="text-sm">
                {ref(i.number)} · {i.title}
              </span>
              <Status value={latest.get(i.id)?.status ?? "Open"} />
            </div>
          ))}
        </section>
      )}
      <div className="panel">
        <VisitForm projectId={project.id} outstanding={open.length} />
      </div>
    </main>
  );
}
