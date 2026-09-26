"use client";
import { useActionState, useState, type ReactNode } from "react";
import { useUnsaved } from "./unsaved";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import {
  createProject,
  createVisit,
  loadDemo,
  generateReport,
} from "@/app/projects/actions";
import type { ActionState } from "@/lib/sitescribe";

export function Field({
  label,
  name,
  defaultValue = "",
  required = false,
  type = "text",
  multiline = false,
  maxLength = 240,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>
        {label}
        {!required && (
          <span className="font-normal text-charcoal/50"> · optional</span>
        )}
      </span>
      {multiline ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          rows={3}
          className={fieldClass}
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          type={type}
          className={fieldClass}
        />
      )}
    </label>
  );
}
export function Submit({
  children,
  pendingLabel = "Saving…",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button size="xl" disabled={pending || disabled} type="submit">
      {pending ? pendingLabel : children}
    </Button>
  );
}
export function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-blue/10 p-3 text-sm">✓ {state.success}</p>
      )}
    </div>
  );
}
export function ProjectForm() {
  const [state, action, pending] = useActionState(createProject, {});
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty && !pending);
  return (
    <form
      data-unsaved-form
      action={action}
      onChange={() => setDirty(true)}
      className="space-y-5"
    >
      <Field name="name" label="Project name" required />
      <Field name="reference" label="Project reference" required />
      <Field name="address" label="Site address" required />
      <Field name="client" label="Client" required />
      <Feedback state={state} />
      <Submit>Create project</Submit>
    </form>
  );
}
export function VisitForm({
  projectId,
  outstanding,
}: {
  projectId: string;
  outstanding: number;
}) {
  const [state, action, pending] = useActionState(createVisit, {});
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty && !pending);
  return (
    <form
      data-unsaved-form
      action={action}
      onChange={() => setDirty(true)}
      className="space-y-5"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <p className="rounded-xl bg-blue/10 p-4 text-sm">
        {outstanding} unresolved {outstanding === 1 ? "item" : "items"} ready to
        follow up. Their references and earlier evidence stay linked.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="date"
          label="Visit date"
          type="date"
          defaultValue={new Date().toLocaleDateString("en-CA")}
          required
        />
        <Field name="engineer" label="Engineer name" required />
      </div>
      <Field name="weather" label="Weather" />
      <Field name="scope" label="Scope of visit" multiline maxLength={10000} />
      <Field
        name="limitations"
        label="Limitations"
        multiline
        maxLength={10000}
      />
      <Feedback state={state} />
      <Submit>Start site visit</Submit>
    </form>
  );
}
export function DemoButton() {
  const [state, action] = useActionState(loadDemo, {});
  return (
    <form action={action} className="space-y-3">
      <Submit pendingLabel="Preparing your demo…">Load demo project</Submit>
      <Feedback state={state} />
    </form>
  );
}
export function GenerateButton({
  projectId,
  visitId,
}: {
  projectId: string;
  visitId: string;
}) {
  const [state, action] = useActionState(generateReport, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="visit_id" value={visitId} />
      <Submit pendingLabel="Assembling report…">Review report ↗</Submit>
      <Feedback state={state} />
    </form>
  );
}
