"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
const warning = "Unsaved notes, recordings and changes will be lost.";
let openConfirmation: Promise<boolean> | null = null;
// A native HTML dialog keeps keyboard focus contained without a blocking browser alert.
export function confirmDiscard(message = warning): Promise<boolean> {
  if (openConfirmation) return openConfirmation;
  openConfirmation = new Promise<boolean>((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "discard-dialog";
    dialog.setAttribute("aria-labelledby", "discard-title");
    dialog.setAttribute("aria-describedby", "discard-description");
    const title = document.createElement("h2");
    title.id = "discard-title";
    title.className = "section-title";
    title.textContent = "Discard unsaved changes?";
    const description = document.createElement("p");
    description.id = "discard-description";
    description.className = "my-4 text-sm leading-6";
    description.textContent = message;
    const controls = document.createElement("div");
    controls.className = "flex flex-wrap gap-3";
    const stay = document.createElement("button");
    stay.textContent = "Keep editing";
    stay.className = buttonVariants();
    stay.autofocus = true;
    const discard = document.createElement("button");
    discard.textContent = "Discard changes";
    discard.className = buttonVariants({ variant: "outline" });
    const finish = (confirmed: boolean) => {
      dialog.close();
      dialog.remove();
      openConfirmation = null;
      previous?.focus();
      resolve(confirmed);
    };
    stay.onclick = () => finish(false);
    discard.onclick = () => finish(true);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    controls.append(stay, discard);
    dialog.append(title, description, controls);
    document.body.append(dialog);
    dialog.showModal();
  });
  return openConfirmation;
}
export function useUnsaved(dirty: boolean) {
  const router = useRouter();
  const value = useRef(dirty);
  const armRef = useRef<() => void>(() => {});
  useEffect(() => {
    value.current = dirty;
    armRef.current();
  }, [dirty]);
  useEffect(() => {
    const pageKey = location.pathname + location.search;
    let guarded = history.state?.sitescribeGuard === pageKey;
    let previousHash = location.hash;
    let leaving = false;
    let alive = true;
    let approvedSubmit = false;
    let confirming = false;
    const confirmNavigation = (action: () => void) => {
      if (confirming) return;
      confirming = true;
      void confirmDiscard().then((yes) => {
        confirming = false;
        if (yes && alive) action();
      });
    };
    const arm = () => {
      if (!guarded && value.current) {
        history.pushState(
          { ...history.state, sitescribeGuard: pageKey },
          "",
          location.href,
        );
        guarded = true;
      }
    };
    armRef.current = arm;
    arm();
    const unload = (e: BeforeUnloadEvent) => {
      if (value.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      if (
        !value.current ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element).closest?.("a[href]");
      if (!a || a.getAttribute("target") === "_blank") return;
      const next = new URL(a.getAttribute("href")!, location.href);
      if (
        next.pathname === location.pathname &&
        next.search === location.search
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      confirmNavigation(() => {
        value.current = false;
        if (next.origin === location.origin)
          router.push(next.pathname + next.search + next.hash);
        else location.assign(next.href);
      });
    };
    const submit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (
        !value.current ||
        approvedSubmit ||
        form.hasAttribute("data-unsaved-form")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      confirmNavigation(() => {
        approvedSubmit = true;
        form.requestSubmit(
          (e.submitter as HTMLButtonElement | null) ?? undefined,
        );
        approvedSubmit = false;
      });
    };
    const hashChanged = () => {
      previousHash = location.hash;
    };
    const pop = (e: PopStateEvent) => {
      if (!guarded || leaving) return;
      if (
        location.pathname + location.search === pageKey &&
        previousHash !== location.hash
      ) {
        previousHash = location.hash;
        return;
      }
      e.stopImmediatePropagation();
      guarded = false;
      if (!value.current) {
        leaving = true;
        history.back();
        return;
      }
      // Restore our entry while the non-blocking confirmation is open.
      arm();
      confirmNavigation(() => {
        value.current = false;
        leaving = true;
        history.go(-2);
      });
    };
    window.addEventListener("hashchange", hashChanged);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      alive = false;
      armRef.current = () => {};
      window.removeEventListener("hashchange", hashChanged);
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [router]);
}
