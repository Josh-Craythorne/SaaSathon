/* Original private images remain directly printable, without an image proxy. */
/* eslint-disable @next/next/no-img-element */
import {
  actionRegister,
  categories,
  missingInformation,
  progressLabel,
  ref,
  reportReference,
  type Report,
  type ReportData,
  type Evidence,
} from "@/lib/sitescribe";

function Meta({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value?.trim() || "Not recorded"}</dd>
    </div>
  );
}
function figures(o: ReportData["observations"][number]) {
  const records = [...(o.history ?? []), o.evidence].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const seen = new Set<string>();
  const result: {
    e: Evidence;
    path: string;
    kind: "photo" | "drawing";
    label: string;
  }[] = [];
  for (const e of records)
    for (const kind of ["photo", "drawing"] as const) {
      const path =
        kind === "photo" ? e.photo_path : e.drawing_pin ? e.drawing_path : null;
      const key = JSON.stringify([
        path,
        kind,
        kind === "photo" ? e.photo_marker : e.drawing_pin,
      ]);
      if (!path || seen.has(key)) continue;
      seen.add(key);
      result.push({
        e,
        path,
        kind,
        label: `Figure ${o.item.number}.${result.length + 1}`,
      });
    }
  return result;
}
export function ReportDocument({
  report,
  data = report.snapshot,
  images,
  unsaved = false,
}: {
  report: Report;
  data?: ReportData;
  images: Record<string, string | null>;
  unsaved?: boolean;
}) {
  const groups = categories
    .map((category) => ({
      category,
      observations: data.observations
        .filter((o) => o.evidence.category === category)
        .sort((a, b) => a.item.number - b.item.number),
    }))
    .filter((g) => g.observations.length);
  const register = actionRegister(data);
  const missing = [
    ...new Set([
      ...missingInformation(data),
      ...register.flatMap(({ item, evidence: e }) =>
        [
          !e.action_required && `${ref(item.number)}: action required`,
          !e.responsible && `${ref(item.number)}: responsible party`,
          !e.due_date && `${ref(item.number)}: due date`,
        ].filter((v): v is string => !!v),
      ),
    ]),
  ];
  const reviewed = report.state === "Reviewed" && !unsaved;
  return (
    <article
      id="report-preview"
      className="report-paper report-document"
      data-report-id={report.id}
      data-review-status={reviewed ? "Reviewed" : "Draft"}
    >
      <header className="report-header">
        <div className="report-kicker">
          <span>SiteScribe / Construction monitoring</span>
          <strong className={`status ${reviewed ? "status-resolved" : ""}`}>
            {reviewed
              ? "Reviewed"
              : unsaved
                ? "Draft · unsaved changes"
                : "Draft"}
          </strong>
        </div>
        <h2>Site visit report</h2>
        <p className="report-project-name">{data.project.name}</p>
        <dl className="report-meta">
          <Meta label="Client" value={data.project.client} />
          <Meta label="Site location" value={data.project.address} />
          <Meta label="Visit date" value={data.visit.date} />
          <Meta label="Engineer" value={data.visit.engineer} />
          <Meta label="Report reference" value={reportReference(data)} />
          <Meta
            label="Version"
            value={`${report.version} · ${reviewed ? "Reviewed" : "Draft"}`}
          />
        </dl>
        {data.project.demo && (
          <p className="report-demo-note">
            Fictional demo. Illustrations and sample records are not a real
            engineering record.
          </p>
        )}
      </header>
      <section className="report-section">
        <h3>1. Executive summary</h3>
        <p className="report-prose">{data.summary}</p>
      </section>
      <section className="report-section">
        <h3>2. Visit scope and conditions</h3>
        <p className="report-prose">
          {data.visit.scope
            ? data.summary.includes(data.visit.scope)
              ? "The visit scope is set out in the executive summary above. Recorded conditions and limitations follow."
              : "The recorded scope, conditions and limitations for this visit follow."
            : "The visit purpose and scope were not recorded. This document is limited to the observations and other information retained in the snapshot."}
        </p>
        {/* Keep scope independently visible if the engineer edited the summary to omit it. */}
        {data.visit.scope && !data.summary.includes(data.visit.scope) && (
          <>
            <h4>Recorded scope</h4>
            <p className="report-prose">{data.visit.scope}</p>
          </>
        )}
        <dl className="report-meta">
          <Meta label="Weather" value={data.visit.weather} />
          <Meta label="Limitations" value={data.visit.limitations} />
        </dl>
      </section>
      <section className="report-section">
        <h3>3. Recorded observations and evidence</h3>
        <p className="report-prose">
          The following observations are grouped by the engineer’s recorded
          category. Item references remain consistent across visits; section and
          figure numbers provide cross-references within this report.
        </p>
        {!groups.length && (
          <p className="report-prose">
            No observations were recorded for this visit. This does not
            establish that no issues were present.
          </p>
        )}
        {groups.map((group, groupIndex) => (
          <section className="report-category" key={group.category}>
            <h4>
              3.{groupIndex + 1} {group.category}
            </h4>
            {group.observations.map((o, index) => {
              const media = figures(o);
              const earlier = [
                ...new Map(
                  (o.history ?? [])
                    .filter((e) => e.raw_notes !== o.prose)
                    .map((e) => [e.raw_notes, e]),
                ).values(),
              ].sort((a, b) => a.sequence - b.sequence);
              return (
                <section
                  key={o.item.id}
                  className="report-observation"
                  id={`item-${o.item.number}`}
                >
                  <h5>
                    3.{groupIndex + 1}.{index + 1} {o.evidence.title}{" "}
                    <span>{ref(o.item.number)}</span>
                  </h5>
                  <p className="report-observation-context">
                    {progressLabel(o)} · Recorded status: {o.evidence.status} ·
                    Priority: {o.evidence.priority}
                  </p>
                  <div
                    className={`report-observation-content ${media.length ? "has-evidence" : ""}`}
                  >
                    <div>
                      <p className="report-prose">{o.prose}</p>
                      <p className="report-cross-reference">
                        {media.length
                          ? `Supporting evidence: ${media.map((f) => f.label).join(", ")}. `
                          : "Photo evidence was not recorded. "}
                        Drawing / location:{" "}
                        {[o.evidence.drawing_reference, o.evidence.location]
                          .filter(Boolean)
                          .join(" · ") || "not recorded"}
                        . Action and responsibility: see {ref(o.item.number)} in
                        section 5.
                      </p>
                      {earlier.length > 0 && (
                        <div className="report-earlier">
                          <h6>Earlier records in this visit</h6>
                          {earlier.map((e) => (
                            <div key={e.id}>
                              <p className="report-observation-context">
                                Earlier recorded status: {e.status}
                              </p>
                              <p className="report-prose">{e.raw_notes}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {media.length > 0 && (
                      <div className="report-figures">
                        {media.map((f) => {
                          const point =
                            f.kind === "photo"
                              ? f.e.photo_marker
                              : f.e.drawing_pin;
                          return (
                            <figure key={f.label} className="report-evidence">
                              {images[f.path] ? (
                                <div className="report-image">
                                  <img
                                    src={images[f.path]!}
                                    alt={`${f.label}: ${ref(o.item.number)} ${f.kind === "photo" ? "photo evidence" : "drawing location"}`}
                                  />
                                  {point && (
                                    <span
                                      className="pin"
                                      style={{
                                        left: `${point.x * 100}%`,
                                        top: `${point.y * 100}%`,
                                      }}
                                    >
                                      {o.item.number}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="report-image-missing">
                                  Evidence unavailable. Refresh private image
                                  links before printing.
                                </p>
                              )}
                              <figcaption>
                                <strong>
                                  {f.label} · {ref(o.item.number)}
                                </strong>{" "}
                                —{" "}
                                {f.kind === "drawing"
                                  ? f.e.drawing_reference ||
                                    "Drawing reference not recorded"
                                  : data.project.demo
                                    ? "Illustrative placeholder"
                                    : "Recorded photograph"}
                                {point ? ` · marker ${o.item.number}` : ""}
                                {f.e.id !== o.evidence.id
                                  ? " · earlier record in this visit"
                                  : ""}
                                .
                              </figcaption>
                            </figure>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </section>
        ))}
      </section>
      <section className="report-section">
        <h3>4. Follow-up progress</h3>
        <p className="report-prose">
          Progress below describes the records captured in this visit. “Recorded
          as resolved” reflects the engineer’s selected status and is not an
          independent assessment.
        </p>
        {data.observations.length ? (
          <ul className="report-progress">
            {data.observations.map((o) => (
              <li key={o.item.id}>
                <strong>
                  {ref(o.item.number)} — {progressLabel(o)}.
                </strong>{" "}
                {o.previous
                  ? `Previously recorded as ${o.previous.status.toLowerCase()}; recorded as ${o.evidence.status.toLowerCase()} in this visit.`
                  : o.previous === null
                    ? "First recorded in this visit."
                    : "Earlier-visit status is not recorded in this snapshot."}
              </li>
            ))}
          </ul>
        ) : (
          <p className="report-prose">
            No visit observations are available to describe follow-up progress.
          </p>
        )}
      </section>
      <section className="report-section">
        <h3>5. Consolidated action register</h3>
        <p className="report-prose">
          This register reflects the retained project records at report
          assembly, including items outside this visit. A report assembled for
          an earlier visit may therefore include later project updates. Resolved
          rows retain the previously recorded action for traceability. “Not
          recorded” does not mean “none”.
        </p>
        {register.length ? (
          <table className="report-actions">
            <caption>
              Recorded actions and latest project status at assembly
            </caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Required action</th>
                <th scope="col">Responsible party</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
                <th scope="col">Due date</th>
              </tr>
            </thead>
            <tbody>
              {register.map(({ item, evidence: e }) => (
                <tr key={item.id}>
                  <th scope="row">
                    {ref(item.number)}
                    <span>{e.title}</span>
                  </th>
                  <td data-label="Required action">
                    {e.action_required || "Not recorded"}
                  </td>
                  <td data-label="Responsible party">
                    {e.responsible || "Not recorded"}
                  </td>
                  <td data-label="Priority">{e.priority}</td>
                  <td data-label="Status">{e.status}</td>
                  <td data-label="Due date">{e.due_date || "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="report-prose">
            No project items were recorded in this snapshot.
          </p>
        )}
      </section>
      <section className="report-section">
        <h3>6. Closing summary and outstanding information</h3>
        <p className="report-prose">
          {data.closing ||
            "A closing summary was not recorded in this report version."}
        </p>
        {missing.length > 0 && (
          <div className="report-information">
            <h4>Information not recorded</h4>
            <p>{missing.join("; ")}.</p>
          </div>
        )}
      </section>
      <footer className="report-footer">
        <p>
          {reviewed
            ? `Reviewed by the engineer · ${new Date(report.reviewed_at!).toISOString().replace("T", " ").slice(0, 19)} UTC`
            : "DRAFT · Engineer review required"}
        </p>
        <p>
          This report records supplied observations and judgments within the
          stated scope and limitations. Review is not certification.
        </p>
        <p>
          {reportReference(data)} · Version {report.version} · Snapshot{" "}
          {report.id}
        </p>
      </footer>
    </article>
  );
}
