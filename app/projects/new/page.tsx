import Link from "next/link";
import { ProjectForm } from "@/components/sitescribe/forms";
import { Heading } from "@/components/sitescribe/shell";
export default function NewProject() {
  return (
    <main id="main" className="workspace max-w-2xl">
      <Link href="/projects" className="back-link">
        ← Projects
      </Link>
      <Heading
        eyebrow="01 / Project setup"
        title="A place for every detail."
        description="Start with the project details. You can add a drawing once the project is created."
      />
      <div className="panel">
        <ProjectForm />
      </div>
    </main>
  );
}
