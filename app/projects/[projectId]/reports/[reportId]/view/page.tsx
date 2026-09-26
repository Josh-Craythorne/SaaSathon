import Link from "next/link";
import { redirect } from "next/navigation";
import { loadReport } from "@/lib/report-server";
import { ReportDocument } from "@/components/sitescribe/report-document";
import {
  CreateReportDraft,
  ReportPrint,
} from "@/components/sitescribe/report-controls";
import { Button } from "@/components/ui/button";
export default async function ReviewedReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { projectId, reportId } = await params;
  const { report, images } = await loadReport(projectId, reportId);
  if (report.state !== "Reviewed")
    redirect(`/projects/${projectId}/reports/${report.id}`);
  const { saved } = await searchParams;
  return (
    <main id="main" className="workspace report-workspace reviewed-workspace">
      <div className="no-print reviewed-toolbar">
        <div>
          <p className="eyebrow">Completed report · Version {report.version}</p>
          <h1>Reviewed site visit report</h1>
          <p role="status">
            {saved === "1"
              ? "Reviewed snapshot saved."
              : "This reviewed snapshot is saved."}{" "}
            Version {report.version} is locked; further edits create a new
            draft.
          </p>
        </div>
        <div className="reviewed-actions">
          <ReportPrint unavailable={Object.values(images).some((v) => !v)} />
          <Button asChild variant="outline" size="xl">
            <Link href={`/projects/${projectId}`}>Back to project</Link>
          </Button>
          <CreateReportDraft reportId={report.id} />
        </div>
      </div>
      <ReportDocument report={report} images={images} />
    </main>
  );
}
