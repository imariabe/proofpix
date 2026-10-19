import { MAX_UPLOAD_BYTES, detectFormat } from "@/lib/forensics/sniff";

export interface ClientValidation {
  ok: boolean;
  error?: string;
}

/**
 * Client-side pre-flight so users get instant feedback. The server repeats
 * every one of these checks against the stored bytes — nothing here is
 * trusted.
 */
export function validateFileClientSide(file: File): ClientValidation {
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatSize(file.size)}. The limit is ${formatSize(
        MAX_UPLOAD_BYTES,
      )}.`,
    };
  }
  return { ok: true };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload a file straight to Convex storage via a signed URL. Returns the
 * storage id. Throws with a human-readable message on failure.
 */
export async function uploadToStorage(
  file: File,
  generateUploadUrl: () => Promise<string>,
): Promise<{ storageId: string }> {
  const buffer = await file.arrayBuffer();
  // Content sniffing in the browser catches obvious mismatches early.
  const detected = detectFormat(new Uint8Array(buffer));
  if (detected === "unknown") {
    throw new Error(
      "That file is not a JPEG, PNG, or WebP image. Please choose a supported image file.",
    );
  }
  const url = await generateUploadUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: new Blob([buffer], { type: file.type || "application/octet-stream" }),
  });
  if (!response.ok) {
    throw new Error("The upload failed. Please try again.");
  }
  const { storageId } = (await response.json()) as { storageId: string };
  return { storageId };
}

/** Probe natural dimensions of a local file for the pre-analysis panel. */
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
