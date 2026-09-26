"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
type Summary = {
  id: string;
  name: string;
  reference: string;
  address: string;
  client: string;
  demo: boolean;
  outstanding: number;
  visits: number;
  latest: string;
  visitId?: string;
  drafts: number;
};
export function ProjectDashboard({ projects }: { projects: Summary[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const results = projects.filter(
    (p) =>
      `${p.name} ${p.reference} ${p.client} ${p.address}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (filter !== "outstanding" || p.outstanding > 0),
  );
  return (
    <>
      <div className="dashboard-toolbar">
        <label className="flex-1 text-sm font-medium">
          Find a project
          <input
            type="search"
            placeholder="Project, reference, client or address"
            className={fieldClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Show
          <select
            className={fieldClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            <option value="outstanding">With outstanding items</option>
          </select>
        </label>
      </div>
      <p className="mb-4 text-sm text-charcoal" role="status">
        {results.length} projects · most recently active first
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {results.map((p) => (
          <article className="panel project-card" key={p.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <p className="eyebrow">{p.reference}</p>
              {p.demo && <span className="status">Fictional demo</span>}
            </div>
            <Link
              href={`/projects/${p.id}`}
              className="mt-4 block text-xl font-semibold hover:underline"
            >
              {p.name}
            </Link>
            <p className="mt-2 text-sm text-charcoal">
              {p.client} · {p.address}
            </p>
            <div className="my-5 grid grid-cols-3 gap-3 border-y border-black/10 py-4 text-xs">
              <span>
                <strong className="block text-xl">{p.outstanding}</strong>
                Outstanding
              </span>
              <span>
                <strong className="block text-xl">{p.visits}</strong>Visits
              </span>
              <span>
                <strong className="block text-xl">{p.drafts}</strong>Draft
                versions
              </span>
            </div>
            <p className="mb-5 text-xs text-charcoal">
              Last activity ·{" "}
              {new Date(p.latest).toLocaleDateString("en-NZ", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link
                  href={
                    p.visitId
                      ? `/projects/${p.id}/visits/${p.visitId}`
                      : `/projects/${p.id}/visits/new`
                  }
                >
                  {p.visitId ? "Continue latest visit" : "Start first visit"}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/projects/${p.id}`}>Project overview</Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!results.length && (
        <div className="panel">
          <h2 className="section-title">No matching projects</h2>
          <p>Try another search or show all projects.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setQ("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}
