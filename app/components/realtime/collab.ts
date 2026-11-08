/**
 * Ortak düzenlemenin ağır parçaları (Yjs, y-protocols, Collaboration eklentileri): not
 * açılınca `useLiveNote` tarafından tembel yüklenir; ızgara sayfaları bunları indirmez.
 */
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { Extensions } from "@tiptap/core";
import { noteExtensions } from "~/domain/notes/editor-schema";
import type { PresenceUser } from "~/domain/realtime/presence";
import { NOTE_FRAGMENT } from "~/domain/realtime/protocol";
import type { NoteSyncProvider } from "./note-provider";

export { NoteSyncProvider } from "./note-provider";

/** Metin editörünün ortak düzenleme eklentileri (geçmiş Yjs'te, imleçler farkındalıkta). */
export function collabExtensions(
  provider: Pick<NoteSyncProvider, "doc" | "awareness">,
  user: PresenceUser,
  placeholder?: string,
): Extensions {
  return [
    ...noteExtensions({ placeholder, collaborative: true }),
    Collaboration.configure({ document: provider.doc, field: NOTE_FRAGMENT }),
    CollaborationCaret.configure({ provider, user, render: renderCaret, selectionRender }),
  ];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (color: unknown) => (typeof color === "string" && HEX.test(color) ? color : null);

/**
 * Diğer kişinin imleci: kişinin renginde 2 px çizgi ve üstünde adıyla etiket (avatar
 * renkleri beyaz metinle ≥ 4,5:1). Renk CSS değişkeninde; biçim `app.css`'te
 * (`.collab-caret`), iki temada da aynı.
 */
export function renderCaret(user: { name?: unknown; color?: unknown }): HTMLElement {
  const caret = document.createElement("span");
  caret.className = "collaboration-carets__caret collab-caret";
  caret.style.setProperty("--caret", safeColor(user.color) ?? "#597895");
  caret.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "collaboration-carets__label collab-caret__label";
  label.textContent = typeof user.name === "string" && user.name ? user.name : "Biri";
  caret.appendChild(label);
  return caret;
}

/** Diğer kişinin seçimi: renginin açık tonu (metin rengi değişmez; okunurluk korunur). */
export function selectionRender(user: { color?: unknown }) {
  const color = safeColor(user.color);
  return color ? { style: `--sel: ${color}`, class: "collab-selection" } : {};
}
