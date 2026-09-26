import Link from "next/link";
import { Layers3, FolderOpen, ArrowUpRight } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
export function Brand() {
  return (
    <Link
      href="/projects"
      className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-blue text-black">
        <Layers3 size={20} />
      </span>
      SiteScribe
      <span className="ml-1 rounded border border-black/10 px-1.5 py-0.5 text-[9px] font-medium tracking-wider">
        FIELD NOTES
      </span>
    </Link>
  );
}
export function Shell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  return (
    <>
      <header className="no-print border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Brand />
          <div className="flex items-center gap-5">
            <span className="hidden max-w-48 truncate text-xs text-charcoal/60 sm:block">
              {email}
            </span>
            <form action={signOut}>
              <Button size="sm" variant="outline">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="no-print border-b border-black/10 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-3 text-xs sm:px-8">
          <FolderOpen size={14} />
          <Link href="/projects" className="font-medium">
            My projects
          </Link>
          <span className="ml-auto text-charcoal/50">
            Private workspace <ArrowUpRight className="ml-1 inline size-3" />
          </span>
        </nav>
      </div>
      {children}
      <footer className="no-print mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-8 text-xs text-charcoal/60 sm:px-8">
        <span>SiteScribe · From site to report.</span>
        <span>Recorded by you. Reviewed by you.</span>
      </footer>
    </>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status ${value === "Resolved" || value === "Reviewed" ? "status-resolved" : value === "In progress" ? "status-progress" : ""}`}
    >
      {value}
    </span>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal/65">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
