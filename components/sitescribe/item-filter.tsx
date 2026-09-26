"use client";
import { useState } from "react";
import Link from "next/link";
import { fieldClass } from "@/components/ui/field";
export function ItemFilter({
  items,
}: {
  items: {
    id: string;
    number: number;
    title: string;
    status: string;
    href: string;
  }[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("unresolved");
  const filtered = items.filter(
    (i) =>
      (status === "all" ||
        (status === "unresolved"
          ? i.status !== "Resolved"
          : i.status === status)) &&
      `${i.title} OBS-${String(i.number).padStart(3, "0")}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Find an item
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Reference or observation"
          className={fieldClass}
        />
      </label>
      <label className="block text-sm">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldClass}
        >
          <option value="unresolved">Outstanding</option>
          <option value="all">All items</option>
          <option>Open</option>
          <option>In progress</option>
          <option>Resolved</option>
        </select>
      </label>
      <p className="text-xs text-charcoal" role="status">
        {filtered.length} items
      </p>
      {filtered.map((i) => (
        <Link className="item-link" key={i.id} href={i.href}>
          <span className="text-xs font-semibold">
            OBS-{String(i.number).padStart(3, "0")}
          </span>
          <span className="status">{i.status}</span>
          <strong className="col-span-2 text-sm">{i.title}</strong>
          <span className="col-span-2 text-sm underline">Follow up →</span>
        </Link>
      ))}
      {!filtered.length && (
        <p className="empty-copy">
          No matching items. Try All items or a different search.
        </p>
      )}
    </div>
  );
}
