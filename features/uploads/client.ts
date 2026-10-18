/**
 * Envoi navigateur → MinIO par formulaire POST présigné (XHR pour la progression).
 * Le fichier doit être le dernier champ du formulaire (exigence S3).
 */
export class UploadAbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "UploadAbortedError";
  }
}

export function postToStorage(
  ticket: { url: string; fields: Record<string, string> },
  file: Blob,
  { onProgress, signal }: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.url);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`storage_status_${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("storage_network")));
    xhr.addEventListener("abort", () => reject(new UploadAbortedError()));
    if (signal) {
      if (signal.aborted) {
        reject(new UploadAbortedError());
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}
