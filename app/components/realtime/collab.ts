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
    CollaborationCaret.configure({ provider, user }),
  ];
}
