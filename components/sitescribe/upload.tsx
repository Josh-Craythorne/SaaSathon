"use client";
/* Original private images use plain img elements so browser print can await decoding. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Camera, Upload } from "lucide-react";
import { prepareUpload, saveDrawing } from "@/app/projects/actions";
import { MAX_FILE_BYTES } from "@/lib/sitescribe";
import { Field, Feedback, Submit } from "./forms";

export function UploadImage({
  label,
  onUploaded,
  onBusy,
  capture = false,
}: {
  label: string;
  onUploaded: (path: string, preview: string) => void;
  onBusy: (busy: boolean) => void;
  capture?: boolean;
}) {
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const previewRef = useRef("");
  useEffect(
    () => () => {
      xhrRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setSaved(false);
    onUploaded("", "");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      !file.size ||
      file.size > MAX_FILE_BYTES
    ) {
      setError(
        "Choose a PNG or JPEG up to 8 MB. Convert HEIC images to JPEG first.",
      );
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);
    setProgress(0);
    onBusy(true);
    try {
      const probe = new Image();
      probe.src = url;
      await probe.decode();
      const result = await prepareUpload({ type: file.type, size: file.size });
      if (result.error || !result.url || !result.path)
        throw new Error(result.error || "Upload could not start.");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("PUT", result.url!);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.timeout = 120000;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(
                new Error("Upload failed. Select the image again to retry."),
              );
        xhr.onerror = () =>
          reject(
            new Error("Connection lost. Select the image again to retry."),
          );
        xhr.ontimeout = () =>
          reject(
            new Error("Upload timed out. Select the image again to retry."),
          );
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      });
      onUploaded(result.path, url);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-3">
        <label className="upload-button">
          <Upload size={18} /> Choose image
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg"
            disabled={progress !== null}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        {capture && (
          <label className="upload-button">
            <Camera size={18} /> Take photo
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg"
              capture="environment"
              disabled={progress !== null}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-charcoal/60">
        PNG or JPEG · up to 8 MB · private to your account
      </p>
      {preview && (
        <img
          src={preview}
          alt="Selected image preview"
          className="max-h-48 rounded-xl object-contain"
        />
      )}
      <div aria-live="polite">
        {progress !== null && (
          <>
            <progress
              className="w-full accent-blue"
              max={100}
              value={progress}
            />
            <p className="text-sm">
              Uploading {progress}%
              {progress === 100 ? " · confirming storage…" : ""}
            </p>
          </>
        )}
        {saved && (
          <p className="text-sm">
            ✓ Image uploaded. Save the form to attach it.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
export function DrawingForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(saveDrawing, {});
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="drawing_path" value={path} />
      <UploadImage
        label="Project drawing"
        onUploaded={(p) => setPath(p)}
        onBusy={setBusy}
      />
      <Field
        name="drawing_reference"
        label="Drawing reference and revision"
        required
      />
      <Feedback state={state} />
      <Submit disabled={busy || !path}>Save drawing</Submit>
    </form>
  );
}
