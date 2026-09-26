import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/sitescribe/shell";
export const dynamic = "force-dynamic";
export default async function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email } = await requireUser();
  return <Shell email={email}>{children}</Shell>;
}
