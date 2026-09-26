"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function ProjectNavigation({
  id,
  name,
  reference,
}: {
  id: string;
  name: string;
  reference: string;
}) {
  const path = usePathname();
  const [section, setSection] = useState("");
  useEffect(() => {
    const update = () => setSection(location.hash);
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, [path]);
  const base = `/projects/${id}`;
  const visit = path.includes("/visits/");
  const report = path.includes("/reports/");
  return (
    <div className="project-context no-print">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <Link href="/projects">Projects</Link>
          <span aria-hidden> / </span>
          <Link href={base}>{name}</Link>
          {path !== base && (
            <>
              <span aria-hidden> / </span>
              <span aria-current="page">
                {report
                  ? "Report"
                  : path.endsWith("/new")
                    ? "Start visit"
                    : "Site visit"}
              </span>
            </>
          )}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <span className="text-xs font-semibold text-charcoal">
            {reference}
          </span>
          <nav aria-label="Project navigation" className="context-tabs">
            <Link
              href={base}
              onClick={() => setSection("")}
              aria-current={path === base && !section ? "page" : undefined}
            >
              Overview
            </Link>
            <Link
              href={`${base}#visits`}
              onClick={() => setSection("#visits")}
              aria-current={
                visit || (path === base && section === "#visits")
                  ? "page"
                  : undefined
              }
            >
              Visits
            </Link>
            <Link
              href={`${base}#items`}
              onClick={() => setSection("#items")}
              aria-current={
                path === base && section === "#items" ? "page" : undefined
              }
            >
              Outstanding items
            </Link>
            <Link
              href={`${base}#reports`}
              onClick={() => setSection("#reports")}
              aria-current={
                report || (path === base && section === "#reports")
                  ? "page"
                  : undefined
              }
            >
              Reports
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
