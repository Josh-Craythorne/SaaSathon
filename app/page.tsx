import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  MapPin,
  FileCheck2,
  Layers3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupNotice } from "@/components/setup-notice";
import { isConfigured } from "@/lib/config";
const steps = [
  {
    Icon: Camera,
    title: "Capture",
    copy: "Photo evidence and your own words.",
  },
  { Icon: MapPin, title: "Locate", copy: "A numbered pin. A clear reference." },
  {
    Icon: FileCheck2,
    title: "Review",
    copy: "An editable report, ready for your review.",
  },
];
export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Layers3 size={24} /> SiteScribe
        </Link>
        <Button asChild variant="outline">
          <Link href="/login">
            Sign in <ArrowUpRight />
          </Link>
        </Button>
      </header>
      <main id="main">
        <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="eyebrow">For the engineer on site.</p>
            <h1 className="mt-7 text-5xl font-semibold leading-[1.03] tracking-tight sm:text-7xl">
              Less paperwork.
              <br />
              More perspective<span className="text-blue">.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-charcoal/65">
              Your observations, photos and drawings. Connected from the first
              site visit to the final outstanding item.
            </p>
            <Button asChild size="xl" className="mt-8">
              <Link href="/projects">
                Open your workspace <ArrowUpRight />
              </Link>
            </Button>
            <p className="mt-4 text-xs text-charcoal/55">
              Civil · Structural · Geotechnical
            </p>
          </div>
          <div className="relative rounded-3xl bg-blue p-6 sm:p-10">
            <div className="mb-5 flex justify-between text-xs font-medium">
              <span>FROM SITE TO REPORT</span>
              <span>01 → 03</span>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-xl shadow-black/10">
              <p className="eyebrow">Your field record</p>
              <h2 className="mt-4 text-2xl font-semibold">
                Every detail.
                <br />
                Right where it belongs.
              </h2>
              {steps.map(({ Icon, title, copy }) => (
                <div
                  key={title}
                  className="mt-6 flex gap-4 border-t border-black/10 pt-5"
                >
                  <Icon size={22} className="shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-xs leading-5 text-charcoal/60">
                      {copy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs">
              Your judgment. An unbroken evidence trail.
            </p>
          </div>
        </section>
        {!isConfigured() && (
          <div className="mx-auto mb-12 max-w-3xl px-5">
            <SetupNotice />
          </div>
        )}
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 border-t border-black/10 px-5 py-6 text-xs text-charcoal/60 sm:px-8">
        <span>SiteScribe · Construction monitoring, clearly recorded.</span>
        <span>Made for the field.</span>
      </footer>
    </>
  );
}
