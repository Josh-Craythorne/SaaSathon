import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/lib/validation";
import { ProjectNavigation } from "@/components/sitescribe/navigation";
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) notFound();
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,reference")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load project context.");
  if (!data) notFound();
  return (
    <>
      <ProjectNavigation {...data} />
      {children}
    </>
  );
}
