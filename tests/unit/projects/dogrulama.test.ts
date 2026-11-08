import { describe, expect, it } from "vitest";
import { parseNoteIntent } from "~/domain/notes/validation";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  parseInviteIntent,
  parseProjectIntent,
  parseProjectsIntent,
} from "~/domain/projects/validation";

const UUID = "0b7c5a52-8a43-4b8e-9d0c-6c1f6f0e2a11";

describe("proje oluşturma ve sıralama eylemleri", () => {
  it("ad kırpılır; renk varsayılan yeşil; açıklama isteğe bağlı", () => {
    expect(parseProjectsIntent({ intent: "create", name: "  Kış Tatili  " })).toEqual({
      ok: true,
      value: {
        intent: "create",
        name: "Kış Tatili",
        color: "yesil",
        description: null,
        emoji: null,
      },
    });
  });

  it("istemci kimliği verilebilir ama UUID olmalı", () => {
    const ok = parseProjectsIntent({ intent: "create", name: "A", id: UUID, color: "mavi" });
    expect(ok).toMatchObject({ ok: true, value: { id: UUID, color: "mavi" } });
    expect(parseProjectsIntent({ intent: "create", name: "A", id: "kisa" })).toEqual({
      ok: false,
      error: "Geçersiz proje kimliği",
    });
  });

  it("boş ya da çok uzun ad, geçersiz renk ve uzun açıklama reddedilir", () => {
    expect(parseProjectsIntent({ intent: "create", name: "   " })).toEqual({
      ok: false,
      error: "Proje adı gerekli",
    });
    expect(
      parseProjectsIntent({ intent: "create", name: "x".repeat(MAX_PROJECT_NAME_LENGTH + 1) }),
    ).toEqual({ ok: false, error: "Proje adı çok uzun" });
    expect(parseProjectsIntent({ intent: "create", name: "A", color: "kirmizi" })).toEqual({
      ok: false,
      error: "Geçersiz renk",
    });
    expect(
      parseProjectsIntent({
        intent: "create",
        name: "A",
        description: "x".repeat(MAX_PROJECT_DESCRIPTION_LENGTH + 1),
      }),
    ).toEqual({ ok: false, error: "Açıklama çok uzun" });
    expect(parseProjectsIntent({ intent: "create", name: "A", emoji: "x".repeat(20) })).toEqual({
      ok: false,
      error: "Geçersiz simge",
    });
  });

  it("boş açıklama ve simge null olur", () => {
    expect(
      parseProjectsIntent({ intent: "create", name: "A", description: "  ", emoji: "" }),
    ).toMatchObject({ ok: true, value: { description: null, emoji: null } });
  });

  it("sıralama JSON kimlik dizisi ister", () => {
    expect(parseProjectsIntent({ intent: "reorder", order: '["a","b"]' })).toEqual({
      ok: true,
      value: { intent: "reorder", order: ["a", "b"] },
    });
    for (const order of ["x", "[1]", '"a"', JSON.stringify(Array(501).fill("a"))]) {
      expect(parseProjectsIntent({ intent: "reorder", order })).toEqual({
        ok: false,
        error: "Geçersiz sıra",
      });
    }
  });

  it("bilinmeyen işlem reddedilir", () => {
    expect(parseProjectsIntent({ intent: "yok" })).toEqual({
      ok: false,
      error: "Bilinmeyen işlem",
    });
  });
});

describe("proje eylemleri", () => {
  it("güncelleme yalnızca gönderilen alanları taşır; hiçbiri yoksa reddedilir", () => {
    expect(parseProjectIntent({ intent: "update", name: " Yeni " })).toEqual({
      ok: true,
      value: { intent: "update", name: "Yeni" },
    });
    expect(parseProjectIntent({ intent: "update", description: "" })).toEqual({
      ok: true,
      value: { intent: "update", description: null },
    });
    expect(parseProjectIntent({ intent: "update", color: "mor", emoji: "📚" })).toEqual({
      ok: true,
      value: { intent: "update", color: "mor", emoji: "📚" },
    });
    expect(parseProjectIntent({ intent: "update" })).toEqual({
      ok: false,
      error: "Değişiklik yok",
    });
    expect(parseProjectIntent({ intent: "update", name: "" })).toEqual({
      ok: false,
      error: "Proje adı gerekli",
    });
    expect(parseProjectIntent({ intent: "update", color: "x" })).toEqual({
      ok: false,
      error: "Geçersiz renk",
    });
    expect(parseProjectIntent({ intent: "update", description: "x".repeat(1000) })).toMatchObject({
      ok: false,
    });
    expect(parseProjectIntent({ intent: "update", emoji: "x".repeat(20) })).toMatchObject({
      ok: false,
    });
  });

  it("silme, geri getirme ve ayrılma alansızdır", () => {
    for (const intent of ["delete", "restore", "leave"]) {
      expect(parseProjectIntent({ intent })).toEqual({ ok: true, value: { intent } });
    }
  });

  it("davet: e-posta ve rol; rol varsayılan düzenleyici", () => {
    expect(parseProjectIntent({ intent: "invite", email: "a@b.co" })).toEqual({
      ok: true,
      value: { intent: "invite", email: "a@b.co", role: "duzenleyici" },
    });
    expect(parseProjectIntent({ intent: "invite", email: "a@b.co", role: "patron" })).toEqual({
      ok: false,
      error: "Geçersiz rol",
    });
    expect(parseProjectIntent({ intent: "invite", email: 3 })).toEqual({
      ok: false,
      error: "Geçerli bir e-posta adresi yaz.",
    });
  });

  it("davet geri çekme, rol verme ve üye çıkarma kimlik ister", () => {
    expect(parseProjectIntent({ intent: "revoke-invite", invitationId: "inv-1" })).toEqual({
      ok: true,
      value: { intent: "revoke-invite", invitationId: "inv-1" },
    });
    expect(parseProjectIntent({ intent: "revoke-invite" })).toEqual({
      ok: false,
      error: "Geçersiz davet",
    });
    expect(
      parseProjectIntent({ intent: "set-role", userId: "user-can", role: "duzenleyici" }),
    ).toEqual({ ok: true, value: { intent: "set-role", userId: "user-can", role: "duzenleyici" } });
    expect(parseProjectIntent({ intent: "set-role", userId: "user-can" })).toEqual({
      ok: false,
      error: "Geçersiz rol",
    });
    expect(parseProjectIntent({ intent: "remove-member", userId: "user-can" })).toEqual({
      ok: true,
      value: { intent: "remove-member", userId: "user-can" },
    });
    expect(parseProjectIntent({ intent: "remove-member", userId: "" })).toEqual({
      ok: false,
      error: "Geçersiz üye",
    });
    expect(parseProjectIntent({ intent: "x" })).toEqual({ ok: false, error: "Bilinmeyen işlem" });
  });
});

describe("davet yanıtı", () => {
  it("kabul ve ret davet kimliği ister", () => {
    expect(parseInviteIntent({ intent: "accept", id: "inv-1" })).toEqual({
      ok: true,
      value: { intent: "accept", id: "inv-1" },
    });
    expect(parseInviteIntent({ intent: "decline", id: "inv-1" })).toEqual({
      ok: true,
      value: { intent: "decline", id: "inv-1" },
    });
    expect(parseInviteIntent({ intent: "accept" })).toEqual({
      ok: false,
      error: "Geçersiz davet",
    });
    expect(parseInviteIntent({ intent: "sil", id: "inv-1" })).toEqual({
      ok: false,
      error: "Bilinmeyen işlem",
    });
  });
});

describe("not eylemlerinde proje alanı", () => {
  it("oluşturma ve çöpü boşaltma isteğe bağlı proje kimliği taşır", () => {
    expect(
      parseNoteIntent({ intent: "create", id: UUID, title: "A", projectId: "web" }),
    ).toMatchObject({ ok: true, value: { projectId: "web" } });
    expect(
      parseNoteIntent({ intent: "create-todo", id: UUID, title: "A", projectId: "web" }),
    ).toMatchObject({ ok: true, value: { projectId: "web" } });
    expect(parseNoteIntent({ intent: "empty-trash", projectId: "web" })).toEqual({
      ok: true,
      value: { intent: "empty-trash", projectId: "web" },
    });
    expect(parseNoteIntent({ intent: "create", id: UUID, title: "A" })).toMatchObject({
      ok: true,
      value: { projectId: undefined },
    });
    expect(parseNoteIntent({ intent: "create", id: UUID, projectId: "boşluk var" })).toEqual({
      ok: false,
      error: "Geçersiz proje",
    });
    expect(parseNoteIntent({ intent: "empty-trash", projectId: "!" })).toEqual({
      ok: false,
      error: "Geçersiz proje",
    });
  });

  it("taşı, taşımayı geri al ve kopyala eylemleri", () => {
    expect(parseNoteIntent({ intent: "move-to-project", id: "n1", projectId: "web" })).toEqual({
      ok: true,
      value: { intent: "move-to-project", id: "n1", projectId: "web" },
    });
    expect(parseNoteIntent({ intent: "move-to-project", id: "n1" })).toEqual({
      ok: false,
      error: "Geçersiz proje",
    });
    expect(parseNoteIntent({ intent: "undo-move", id: "n1" })).toEqual({
      ok: true,
      value: { intent: "undo-move", id: "n1" },
    });
    expect(parseNoteIntent({ intent: "copy-to", id: "n1", newId: UUID })).toEqual({
      ok: true,
      value: { intent: "copy-to", id: "n1", newId: UUID, projectId: null },
    });
    expect(parseNoteIntent({ intent: "copy-to", id: "n1", newId: UUID, projectId: "web" })).toEqual(
      { ok: true, value: { intent: "copy-to", id: "n1", newId: UUID, projectId: "web" } },
    );
    expect(parseNoteIntent({ intent: "copy-to", id: "n1", newId: "x" })).toEqual({
      ok: false,
      error: "Geçersiz kopya kimliği",
    });
    expect(parseNoteIntent({ intent: "copy-to", id: "n1", newId: UUID, projectId: "!" })).toEqual({
      ok: false,
      error: "Geçersiz proje",
    });
  });
});

describe("iyimser arayüz: projeye taşıma", () => {
  it("projeye taşınan not kişisel ızgaradan hemen kalkar", async () => {
    const { applyPendingIntents } = await import("~/domain/notes/optimistic");
    const card = {
      id: "n1",
      kind: "text" as const,
      title: "A",
      color: "default" as const,
      pinned: false,
      position: 0,
      preview: "",
      tasks: [],
      moreTasks: 0,
      updatedAt: "2026-11-07T10:00:00.000Z",
      archivedAt: null,
      trashedAt: null,
    };
    expect(
      applyPendingIntents(
        [card],
        [{ intent: "move-to-project", id: "n1", projectId: "p" }],
        "notlar",
      ),
    ).toEqual([]);
  });
});
