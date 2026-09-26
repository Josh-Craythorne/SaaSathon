import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { readAll } from "@/lib/sitescribe-server";
import { latestEvidence } from "@/lib/sitescribe";
import { Heading } from "@/components/sitescribe/shell";
import { ProjectDashboard } from "@/components/sitescribe/project-dashboard";
import { DemoButton } from "@/components/sitescribe/forms";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Projects" };
export default async function ProjectsPage() {
  const { supabase, userId } = await requireUser();
  const [projects, visits, evidence, reports] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("projects")
        .select()
        .eq("user_id", userId)
        .order("created_at")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("visits")
        .select()
        .eq("user_id", userId)
        .order("created_at")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("evidence")
        .select()
        .eq("user_id", userId)
        .order("sequence")
        .range(from, to),
    ),
    readAll((from, to) =>
      supabase
        .from("reports")
        .select("project_id,state,created_at")
        .eq("user_id", userId)
        .order("created_at")
        .range(from, to),
    ),
  ]);
  const latest = [...latestEvidence(evidence).values()];
  const summaries = projects
    .map((p) => {
      const pv = visits
        .filter((v) => v.project_id === p.id)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.created_at.localeCompare(a.created_at),
        );
      const activity = [
        p.created_at,
        ...pv.map((v) => v.created_at),
        ...evidence
          .filter((e) => e.project_id === p.id)
          .map((e) => e.created_at),
        ...reports
          .filter((r) => r.project_id === p.id)
          .map((r) => r.created_at),
      ]
        .sort()
        .at(-1)!;
      return {
        ...p,
        outstanding: latest.filter(
          (e) => e.project_id === p.id && e.status !== "Resolved",
        ).length,
        visits: pv.length,
        latest: activity,
        visitId: pv[0]?.id,
        drafts: reports.filter(
          (r) => r.project_id === p.id && r.state === "Draft",
        ).length,
      };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest));
  return (
    <main id="main" className="workspace">
      <Heading
        eyebrow="Private workspace"
        title="Projects"
        description="Pick up a visit, follow up an item, or start a new project."
      >
        <Button asChild size="xl">
          <Link href="/projects/new">+ New project</Link>
        </Button>
      </Heading>
      <div className="mb-8 grid grid-cols-3 gap-3">
        <div className="stat">
          <span>Active projects</span>
          <strong>{projects.length}</strong>
        </div>
        <div className="stat">
          <span>Outstanding items</span>
          <strong>
            {latest.filter((e) => e.status !== "Resolved").length}
          </strong>
        </div>
        <div className="stat">
          <span>Recorded visits</span>
          <strong>{visits.length}</strong>
        </div>
      </div>
      {projects.length ? (
        <ProjectDashboard projects={summaries} />
      ) : (
        <section className="panel py-12">
          <h2 className="section-title">Your first site starts here.</h2>
          <p className="mb-6 text-sm">
            Create a project, then start a visit to collect your observations.
          </p>
          <Button asChild>
            <Link href="/projects/new">Create your first project</Link>
          </Button>
        </section>
      )}
      <details className="panel mt-8">
        <summary className="cursor-pointer font-medium">
          Explore a fictional demo project
        </summary>
        <p className="my-4 text-sm">
          Two visits, three illustrative observations and a complete follow-up
          trail. Existing work stays intact.
        </p>
        <DemoButton />
      </details>
    </main>
  );
}
