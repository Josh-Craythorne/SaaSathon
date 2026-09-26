import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { SetupNotice } from "@/components/setup-notice";
import { isConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };
export default async function LoginPage() {
  const configured = isConfigured();
  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims.sub) redirect("/projects");
  }
  return (
    <main
      id="main"
      className="grid-container flex min-h-screen flex-col bg-off-white py-6"
    >
      <Link href="/" className="w-fit text-xl font-semibold text-charcoal">
        SiteScribe
      </Link>
      <div className="mx-auto my-auto w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-10">
        <p className="eyebrow mb-4">YOUR FIELD WORKSPACE</p>
        <h1 className="mb-4 text-3xl font-semibold tracking-tight">
          Sign in to SiteScribe.
        </h1>
        <p className="mb-8 text-sm leading-6">
          We’ll email you a code. Your first sign-in creates your account.
        </p>
        {configured ? <LoginForm /> : <SetupNotice />}
      </div>
      <p className="mt-6 text-center text-sm text-charcoal/60">
        Projects, site evidence and reviewed reports in one workspace.
      </p>
    </main>
  );
}
