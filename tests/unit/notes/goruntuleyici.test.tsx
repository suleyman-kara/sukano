import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MoveTarget, NoteAccessInfo } from "~/components/notes/note-access";
import { NoteDialog } from "~/components/notes/note-dialog";
import type { Assignable } from "~/components/tasks/person-picker";
import { authorshipLine, DELETED_USER, formatAgo } from "~/domain/notes/authorship";
import { makeTask } from "~/domain/tasks/model";
import type { NoteDetail } from "~/lib/notes.server";

/**
 * Proje notu ayrıntısı (States2 → Görüntüleyici, TViewerNote, MViewerNote, TodoNote
 * `.meta`): oluşturan / son düzenleyen satırı, görüntüleyicide salt okunur not,
 * düzenleyicide "Kopyala…", kişisel notta "Taşı veya kopyala…".
 */

const NOW = new Date("2026-11-07T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ tasks: [] }), { status: 200 })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const MEMBERS: Assignable[] = [
  { id: "can", name: "Can Yılmaz", color: "#398264", isMe: true, viewer: true },
  { id: "ayse", name: "Ayşe Demir", color: "#B25D49", isMe: false, viewer: false },
  { id: "zeynep", name: "Zeynep Arslan", color: "#7A5FB8", isMe: false, viewer: false },
];
const PROJECT = { id: "foto", name: "Fotoğraf Arşivi", color: "pembe" as const };
const TARGETS: MoveTarget[] = [{ ...PROJECT, role: "yonetici" }];

function todoNote(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: "album-secimi",
    kind: "todo",
    title: "Albüm seçimi",
    color: "default",
    pinned: false,
    bodyHtml: "",
    tasks: [],
    todoTasks: [
      makeTask("g1", null, 0, { title: "2019–2023 arası" }),
      makeTask("g2", null, 1, { title: "Annemin albümleri" }),
      makeTask("g3", null, 2, { title: "Kapak", completedAt: 1, completedBy: "ayse" }),
    ],
    attachmentCount: 0,
    projectId: PROJECT.id,
    createdBy: { id: "ayse", name: "Ayşe Demir", avatarColor: "#B25D49" },
    updatedBy: { id: "zeynep", name: "Zeynep Arslan", avatarColor: "#7A5FB8" },
    assignees: { g1: ["zeynep"] },
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-07T10:00:00.000Z",
    archivedAt: null,
    trashedAt: null,
    ...over,
  };
}

function open(note: NoteDetail, access: NoteAccessInfo, targets: MoveTarget[] = TARGETS) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <NoteDialog note={note} access={access} targets={targets} closeTo="/proje/foto" />
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return screen.getByRole("dialog", { name: note.title });
}

const viewer: NoteAccessInfo = {
  kind: "project",
  project: PROJECT,
  role: "goruntuleyici",
  members: MEMBERS,
};
const editor: NoteAccessInfo = { ...viewer, role: "duzenleyici" };

describe("görüntüleyici, salt okunur not", () => {
  it("kilitli rozet, salt okunur açıklaması; kutucuk yok, madde işareti ve tamamlandı işareti var", () => {
    const dialog = open(todoNote(), viewer);
    expect(within(dialog).getByText("Görüntüleyici")).toBeVisible();
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Salt okunur. Okur ve arar; not ekleyemez, görev işaretleyemez.",
    );
    expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dialog).getByLabelText("Not başlığı")).toHaveAttribute("readonly");
    for (const input of within(dialog).getAllByRole("textbox", { name: "Görev başlığı" })) {
      expect(input).toHaveAttribute("readonly");
    }
    expect(within(dialog).queryByRole("button", { name: "Görev ekle" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Kişiye ata" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Tarih ver" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Atananlar: Zeynep Arslan")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Sana atanan görevi de işaretleyemezsin");
  });

  it("menü, taşı/kopyala, sabitle, renk ve arşiv yok; sürüm geçmişi açılır", () => {
    const dialog = open(todoNote(), viewer);
    for (const name of ["Kopyala…", "Diğer", "Sabitle", "Renk", "Arşivle", "Çöpe at"]) {
      expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(within(dialog).getByRole("button", { name: "Sürüm geçmişi" })).toBeEnabled();
    // Tasarım v2: ✕ yok; yalnızca alt çubuktaki "Kapat".
    expect(within(dialog).getAllByRole("button", { name: "Kapat" })).toHaveLength(1);
  });

  it("klavyeyle satırlar arasında gezilir ama Enter görev açmaz, Ctrl+Enter işaretlemez", async () => {
    const user = userEvent.setup();
    const dialog = open(todoNote(), viewer);
    const [first, second] = within(dialog).getAllByRole("textbox", { name: "Görev başlığı" });
    first!.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(second).toHaveFocus());
    await user.keyboard("{Enter}{Control>}{Enter}{/Control}x");
    expect(within(dialog).getAllByRole("textbox", { name: "Görev başlığı" })).toHaveLength(2);
    expect(second).toHaveValue("Annemin albümleri");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("metin notu düzenlenemez", () => {
    const dialog = open(
      todoNote({
        kind: "text",
        title: "Tarama listesi",
        bodyHtml: "<p>600 dpi</p>",
        todoTasks: [],
      }),
      viewer,
    );
    const body = within(dialog).getByRole("textbox", { name: "Not" });
    expect(body).toHaveAttribute("contenteditable", "false");
    expect(within(dialog).queryByRole("toolbar")).not.toBeInTheDocument();
  });
});

describe("proje notu ayrıntısı", () => {
  it("oluşturan ve son düzenleyen satırı görünür", () => {
    const dialog = open(todoNote(), editor);
    expect(within(dialog).getByTestId("not-yazarlari")).toHaveTextContent(
      "Ayşe Demir oluşturdu · Son düzenleyen Zeynep Arslan, 2 saat önce",
    );
  });

  it("düzenleyicide kutucuk ve kişi simgesi var; Kopyala… diyaloğu açılır, taşı yok", async () => {
    const user = userEvent.setup();
    const dialog = open(todoNote(), editor, [
      { ...PROJECT, role: "duzenleyici" },
      { id: "ev", name: "Ev Taşınma", color: "mavi", role: "yonetici" },
    ]);
    expect(within(dialog).getAllByRole("checkbox").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole("button", { name: "Kişiye ata" }).length).toBeGreaterThan(0);
    await user.click(within(dialog).getByRole("button", { name: "Diğer" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Taşı veya kopyala…" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Kopyala…" }));
    const copy = await screen.findByRole("dialog", { name: "Notu kopyala" });
    expect(
      within(copy)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Kişisel alanımNotlarım", "Ev TaşınmaYönetici"]);
  });

  it("kişisel notta Taşı veya kopyala… açılır; yazar satırı ve kişi simgesi yok", async () => {
    const user = userEvent.setup();
    const dialog = open(
      todoNote({ projectId: null, createdBy: null, updatedBy: null, assignees: {} }),
      { kind: "personal" },
    );
    expect(within(dialog).queryByTestId("not-yazarlari")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Kişiye ata" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Diğer" }));
    await user.click(await screen.findByRole("menuitem", { name: "Taşı veya kopyala…" }));
    expect(await screen.findByRole("dialog", { name: "Notu projeye taşı" })).toBeVisible();
  });
});

describe("oluşturan / son düzenleyen metni", () => {
  it("göreli zaman: az önce, dakika, saat, dün, gün, sonra tarih", () => {
    const at = (iso: string) => formatAgo(new Date(iso), NOW);
    expect(at("2026-11-07T11:59:30Z")).toBe("az önce");
    expect(at("2026-11-07T11:15:00Z")).toBe("45 dakika önce");
    expect(at("2026-11-07T09:00:00Z")).toBe("3 saat önce");
    expect(at("2026-11-06T09:00:00Z")).toBe("dün");
    expect(at("2026-11-04T12:00:00Z")).toBe("3 gün önce");
    expect(at("2026-10-20T07:30:00Z")).toBe("20 Eki, 10:30");
    expect(formatAgo(new Date("2026-11-08T00:00:00Z"), NOW)).toBe("az önce");
  });

  it("silinmiş kişi 'Silinmiş kullanıcı' görünür", () => {
    expect(
      authorshipLine(null, { name: "Ayşe Demir" }, new Date("2026-11-07T11:00:00Z"), NOW),
    ).toBe(`${DELETED_USER} oluşturdu · Son düzenleyen Ayşe Demir, 1 saat önce`);
  });
});
