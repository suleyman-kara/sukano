import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteDialog } from "~/components/notes/note-dialog";
import { makeTask } from "~/domain/tasks/model";
import type { NoteDetail } from "~/lib/notes.server";
import { setMedia } from "../../helpers/media";

/**
 * Açık not (tasarım v2 / v2.1): sağ üstte Sabitle · Arşivle, ✕ yok; alt çubukta Renk ·
 * Hatırlatıcı · Dosya eki · Aa · ⋯ … Kapat; ⋯ menüsünün sonunda kırmızı "Sil"; biçimlendirme
 * çubuğu Aa'nın arkasında. Mobilde üst ve alt çubuk ayrı.
 */

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true, tasks: [] }), { status: 200 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function note(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: "ev-tadilati",
    kind: "text",
    title: "Ev tadilatı fikirleri",
    color: "turuncu",
    pinned: false,
    bodyHtml: "<p>Salon</p>",
    tasks: [],
    todoTasks: [],
    attachmentCount: 0,
    attachments: [],
    projectId: null,
    createdBy: null,
    updatedBy: null,
    assignees: {},
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-07T10:00:00.000Z",
    archivedAt: null,
    trashedAt: null,
    ...over,
  };
}

const todo = (over: Partial<NoteDetail> = {}) =>
  note({
    kind: "todo",
    title: "Haftalık plan",
    bodyHtml: "",
    todoTasks: [makeTask("g1", null, 0, { title: "Spor" })],
    ...over,
  });

function open(n: NoteDetail) {
  const Stub = createRoutesStub([
    { path: "/not", Component: () => <NoteDialog note={n} closeTo="/" /> },
    { path: "/", Component: () => <p>Izgara</p> },
    { path: "/api/notlar", action: () => ({ ok: true }) },
  ]);
  render(
    <>
      <Stub initialEntries={["/not"]} />
      <Toaster />
    </>,
  );
  return screen.getByRole("dialog", { name: n.title });
}

const names = (els: HTMLElement[]) => els.map((e) => e.getAttribute("aria-label"));

describe("açık not · masaüstü", () => {
  it("sağ üstte Sabitle ve Arşivle var; ✕ yok, yalnızca metin düğmesi Kapat", () => {
    const dialog = open(note());
    expect(within(dialog).getByRole("button", { name: "Sabitle" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Arşivle" })).toBeInTheDocument();
    const kapat = within(dialog).getAllByRole("button", { name: "Kapat" });
    expect(kapat).toHaveLength(1);
    expect(kapat[0]).toHaveTextContent("Kapat");
    expect(within(dialog).queryByRole("button", { name: "Çöpe at" })).toBeNull();
  });

  it("metin notunun alt çubuğu Renk · Hatırlatıcı · Dosya ekle · Biçimlendirme · Diğer", () => {
    const dialog = open(note());
    const kapat = within(dialog).getByRole("button", { name: "Kapat" });
    const bar = kapat.parentElement!;
    expect(names(within(bar).getAllByRole("button")).slice(0, 5)).toEqual([
      "Renk",
      "Not hatırlatıcısı",
      "Dosya ekle",
      "Biçimlendirme",
      "Diğer",
    ]);
    // Eski ayrı düğmeler kalktı.
    for (const name of ["Kopyasını oluştur", "Sürüm geçmişi", "Taşı veya kopyala…"]) {
      expect(within(dialog).queryByRole("button", { name })).toBeNull();
    }
  });

  it("biçimlendirme çubuğu varsayılan gizli; Aa açar ve kapatır", async () => {
    const user = userEvent.setup();
    const dialog = open(note());
    const aa = within(dialog).getByRole("button", { name: "Biçimlendirme" });
    const panel = document.getElementById(aa.getAttribute("aria-controls")!)!;
    expect(aa).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("inert");
    await user.click(aa);
    expect(aa).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("data-open");
    expect(panel).not.toHaveAttribute("inert");
    expect(within(panel).getByRole("button", { name: "Numaralı liste" })).toBeEnabled();
    await user.click(aa);
    expect(aa).toHaveAttribute("aria-expanded", "false");
  });

  it("⋯ menüsü yukarı açılır; kanonik sıra, Sil en sonda kırmızı; Sil onaysız çöpe atar ve Geri al toast'ı gösterir", async () => {
    const user = userEvent.setup();
    const dialog = open(note());
    await user.click(within(dialog).getByRole("button", { name: "Diğer" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-side", "top");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Taşı veya kopyala…",
      "Kopyasını oluştur",
      "Sürüm geçmişi",
      "Yapılacaklar notuna dönüştür",
      "Sil",
    ]);
    expect(items.at(-1)).toHaveAttribute("data-variant", "destructive");
    expect(items.at(-1)!.previousElementSibling).toHaveAttribute("role", "separator");
    await user.click(items.at(-1)!);
    expect(await screen.findByText(/Not çöpe atıldı/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geri al" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Izgara")).toBeInTheDocument());
  });

  it("yapılacaklar notunda Dosya ekle ve Aa yok; ⋯ görev komutları ve Klavye kısayolları ile başlar, Sil ile biter", async () => {
    const user = userEvent.setup();
    const dialog = open(todo());
    expect(within(dialog).queryByRole("button", { name: "Dosya ekle" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Biçimlendirme" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Diğer" }));
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Tümünü aç",
      "Tümünü kapat",
      "Tamamlananları sil",
      "Taşı veya kopyala…",
      "Kopyasını oluştur",
      "Sürüm geçmişi",
      "Metin notuna dönüştür",
      "Klavye kısayollarıCtrl+/",
      "Sil",
    ]);
  });

  it("arşivdeki notta sağ üstte Arşivden çıkar, Sabitle yok", () => {
    const dialog = open(note({ archivedAt: "2026-11-07T10:00:00.000Z" }));
    expect(within(dialog).getByRole("button", { name: "Arşivden çıkar" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Sabitle" })).toBeNull();
  });
});

describe("açık not · mobil", () => {
  beforeEach(() => setMedia({ width: 390, coarse: true }));

  it("metin notu: üstte Geri · Sabitle · Arşivle, altta Renk · Hatırlatıcı · Dosya ekle · Aa · ⋯; sayfada renk yok, Sil en sonda", async () => {
    const user = userEvent.setup();
    const dialog = open(note());
    const geri = within(dialog).getByRole("button", { name: "Geri" });
    expect(names(within(geri.parentElement!).getAllByRole("button"))).toEqual([
      "Geri",
      "Sabitle",
      "Arşivle",
    ]);
    const aa = within(dialog).getByRole("button", { name: "Biçimlendirme" });
    expect(names(within(aa.parentElement!).getAllByRole("button"))).toEqual([
      "Renk",
      "Not hatırlatıcısı",
      "Dosya ekle",
      "Biçimlendirme",
      "Diğer",
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Diğer" }));
    const sheet = await screen.findByRole("dialog", { name: /not işlemleri/ });
    expect(within(sheet).queryByRole("group", { name: "Not rengi" })).toBeNull();
    const items = within(within(sheet).getByRole("menu", { name: "Not işlemleri" })).getAllByRole(
      "menuitem",
    );
    expect(items.map((i) => i.textContent)).toEqual([
      "Taşı veya kopyala…",
      "Kopyasını oluştur",
      "Sürüm geçmişi",
      "Yapılacaklar notuna dönüştür",
      "Sil",
    ]);
  });

  it("yapılacaklar notu: alt çubuk yok, üstte Geri · Sabitle · Arşivle · Hatırlatıcı · ⋯", () => {
    const dialog = open(todo());
    const geri = within(dialog).getByRole("button", { name: "Geri" });
    expect(names(within(geri.parentElement!).getAllByRole("button"))).toEqual([
      "Geri",
      "Sabitle",
      "Arşivle",
      "Not hatırlatıcısı",
      "Diğer",
    ]);
    expect(within(dialog).queryByRole("button", { name: "Biçimlendirme" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Renk" })).toBeNull();
  });
});
