import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function LegacyIdeas(){await requireUser();redirect("/projects");}
