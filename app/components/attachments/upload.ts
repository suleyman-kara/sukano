import { MESSAGES } from "~/domain/attachments/rules";
import type { AttachmentView } from "~/domain/attachments/pending";

export type UploadResult =
  { ok: true; attachment: AttachmentView } | { ok: false; error: string; retryable: boolean };

/**
 * Eki yükler (`POST /api/notlar/:id/ekler`, multipart `dosya`). İlerleme için
 * XMLHttpRequest (fetch yükleme ilerlemesi vermez). Ağ hatası ve 5xx tekrar denenebilir;
 * 4xx sunucunun Türkçe metniyle döner.
 */
export function uploadAttachment(
  noteId: string,
  file: File,
  onProgress: (loaded: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.set("dosya", file, file.name);
    xhr.open("POST", `/api/notlar/${noteId}/ekler`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onerror = () => resolve({ ok: false, error: MESSAGES.network, retryable: true });
    xhr.onload = () => {
      const res = xhr.response as { attachment?: AttachmentView; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && res?.attachment) {
        resolve({ ok: true, attachment: res.attachment });
      } else if (xhr.status >= 400 && xhr.status < 500 && res?.error) {
        resolve({ ok: false, error: res.error, retryable: false });
      } else {
        resolve({ ok: false, error: MESSAGES.network, retryable: true });
      }
    };
    xhr.send(body);
  });
}

/** Eki kaldırır (`DELETE /api/ekler/:id`). */
export async function deleteAttachment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/ekler/${id}`, { method: "DELETE" });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "Ek kaldırılamadı" };
  } catch {
    return { ok: false, error: "Ek kaldırılamadı · bağlantını denetle" };
  }
}
