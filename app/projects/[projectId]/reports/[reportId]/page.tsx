import Link from "next/link";
import { redirect } from "next/navigation";
import { loadReport } from "@/lib/report-server";
import { ReportEditor } from "@/components/sitescribe/report-editor";
export default async function ReportPage({
  params,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
}) {
  const { projectId, reportId } = await params;
  const { report, images } = await loadReport(projectId, reportId);
  if (report.state === "Reviewed")
    redirect(`/projects/${projectId}/reports/${report.id}/view`);
  return (
    <main id="main" className="workspace report-workspace">
      <Link
        href={`/projects/${projectId}/visits/${report.visit_id}`}
        className="no-print back-link"
      >
        ← Back to site visit
      </Link>
      <ReportEditor key={report.id} report={report} images={images} />
    </main>
  );
}
