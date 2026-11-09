import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { Toaster, toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPalette } from "~/components/notes/color-palette";
import { Composer } from "~/components/notes/composer";
import { NoteCard } from "~/components/notes/note-card";
import { useNoteActions, type NoteActions } from "~/components/notes/use-note-actions";
import type { NoteCardData } from "~/domain/notes/optimistic";
import { setMedia } from "../../helpers/media";

const note = (extra: Partial<NoteCardData> = {}): NoteCardData => ({
  id: "n1",
  kind: "text",
  title: "Ev tadilatı fikirleri",
  color: "turuncu",
  pinned: false,
  position: 0,
  preview: "Salon duvarı için sıcak gri tonları.",
  tasks: [],
  moreTasks: 0,
  updatedAt: "2026-11-05T11:20:00.000Z",
  archivedAt: null,
  trashedAt: null,
  ...extra,
});

function fakeActions(): NoteActions {
  return {
    run: vi.fn(),
    create: vi.fn(),
    setColor: vi.fn(),
    setPinned: vi.fn(),
    move: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    duplicate: vi.fn(),
    deletePermanently: vi.fn(),
    emptyTrash: vi.fn(),
  } as unknown as NoteActions;
}

function inRouter(ui: React.ReactNode) {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{ui}</> }]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("NoteCard", () => {
  it("başlığı, önizlemeyi ve notu açan bağlantıyı gösterir", () => {
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={fakeActions()}
        onVersions={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ev tadilatı fikirleri" })).toBeInTheDocument();
    expect(screen.getByText("Salon duvarı için sıcak gri tonları.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ev tadilatı fikirleri" })).toHaveAttribute(
      "href",
      "/not/n1",
    );
  });

  it("eylem çubuğu: arşivle ve sabitle çağrılır; çöp düğmesi yok, hatırlatıcı açık, taşı devre dışı", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={actions}
        onVersions={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Arşivle" }));
    expect(actions.archive).toHaveBeenCalledWith("n1");
    expect(screen.queryByRole("button", { name: "Çöpe at" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sabitle" }));
    expect(actions.setPinned).toHaveBeenCalledWith("n1", true);
    expect(screen.getByRole("button", { name: "Not hatırlatıcısı" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Taşı veya kopyala…" })).toBeDisabled();
  });

  it("renk paletinden seçilen renk uygulanır", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={actions}
        onVersions={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Renk" }));
    await user.click(await screen.findByRole("button", { name: "Mor" }));
    expect(actions.setColor).toHaveBeenCalledWith("n1", "mor");
  });

  it("⋯ menüsü kanonik sırayla; Sil en sonda ayraçtan sonra kırmızı ve onaysız çöpe atar", async () => {
    const actions = fakeActions();
    const onVersions = vi.fn();
    const onMoveCopy = vi.fn();
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={actions}
        onVersions={onVersions}
        onMoveCopy={onMoveCopy}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Diğer" }));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Taşı veya kopyala…",
      "Kopyasını oluştur",
      "Sürüm geçmişi",
      "Yapılacaklar notuna dönüştür",
      "Sil",
    ]);
    expect(items[3]).not.toHaveAttribute("data-disabled");
    const sil = items.at(-1)!;
    expect(sil).toHaveAttribute("data-variant", "destructive");
    expect(sil.previousElementSibling).toHaveAttribute("role", "separator");
    // Kartta "Klavye kısayolları" yok (yalnızca açık notta).
    expect(within(menu).queryByRole("menuitem", { name: /Klavye kısayolları/ })).toBeNull();
    await user.click(sil);
    expect(actions.trash).toHaveBeenCalledWith("n1");
    await user.click(screen.getByRole("button", { name: "Diğer" }));
    await user.click(await screen.findByRole("menuitem", { name: "Kopyasını oluştur" }));
    expect(actions.duplicate).toHaveBeenCalledWith("n1");
    await user.click(screen.getByRole("button", { name: "Diğer" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sürüm geçmişi" }));
    expect(onVersions).toHaveBeenCalledWith("n1");
  });

  it("biçimli önizleme kalın, liste ve başlığı gösterir; 10 satırla sınırlı", () => {
    inRouter(
      <NoteCard
        note={note({
          preview: "Mutfak\nDolap",
          previewHtml:
            '<p class="pv-h">Mutfak</p><p><strong>Salon:</strong> gri</p><ul><li>Dolap</li></ul><p>Bkz. <span class="pv-a">teklif</span></p>',
        })}
        view="notlar"
        href="/not/n1"
        actions={fakeActions()}
        onVersions={vi.fn()}
      />,
    );
    const preview = document.querySelector<HTMLElement>("[data-onizleme]")!;
    expect(preview).toHaveClass("card-preview");
    expect(within(preview).getByText("Salon:").tagName).toBe("STRONG");
    expect(within(preview).getByRole("listitem")).toHaveTextContent("Dolap");
    // Bağlantı kartta gezinmez: odaklanılabilir bir bağlantı değildir.
    expect(within(preview).queryByRole("link")).toBeNull();
    expect(within(preview).getByText("teklif")).toHaveClass("pv-a");
  });

  it("Alt+ok klavye ile taşır", async () => {
    const onKeyMove = vi.fn();
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={fakeActions()}
        onVersions={vi.fn()}
        onKeyMove={onKeyMove}
      />,
    );
    screen.getByRole("link").focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(onKeyMove.mock.calls).toEqual([[1], [-1]]);
  });

  it("yapılacaklar kartı görevleri ve kalan sayısını gösterir", () => {
    inRouter(
      <NoteCard
        note={note({
          kind: "todo",
          preview: "",
          tasks: [{ id: "g1", title: "Süt", done: false }],
          moreTasks: 3,
        })}
        view="notlar"
        actions={fakeActions()}
        onVersions={vi.fn()}
      />,
    );
    expect(screen.getByText("Süt")).toBeInTheDocument();
    expect(screen.getByText("+3 görev daha")).toBeInTheDocument();
  });

  it("arşivde 'Arşivden çıkar', çöpte 'Geri yükle' ve 'Kalıcı olarak sil' ile kalan gün", async () => {
    const actions = fakeActions();
    const onRequestDelete = vi.fn();
    const user = userEvent.setup();
    const { unmount } = inRouter(
      <NoteCard
        note={note()}
        view="arsiv"
        href="/arsiv/not/n1"
        actions={actions}
        onVersions={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Arşivden çıkar" }));
    expect(actions.unarchive).toHaveBeenCalledWith("n1");
    expect(screen.getByText("Arşivde")).toBeInTheDocument();
    unmount();

    const trashed = note({ trashedAt: "2026-11-05T12:00:00.000Z" });
    inRouter(
      <NoteCard
        note={trashed}
        view="cop"
        actions={actions}
        onVersions={vi.fn()}
        onRequestDelete={onRequestDelete}
        now={new Date("2026-11-07T00:00:00.000Z")}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("6 gün sonra silinir")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Geri yükle" }));
    expect(actions.restore).toHaveBeenCalledWith("n1");
    await user.click(screen.getByRole("button", { name: "Kalıcı olarak sil" }));
    expect(onRequestDelete).toHaveBeenCalledWith(trashed);
  });

  it("dokunmatikte yalnızca ⋯ görünür ve alttan açılan sayfa renk, sabitle, arşiv işlemlerini sunar", async () => {
    setMedia({ width: 390, coarse: true });
    const actions = fakeActions();
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={actions}
        onVersions={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Arşivle" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ev tadilatı fikirleri: işlemler" }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Yeşil" }));
    expect(actions.setColor).toHaveBeenCalledWith("n1", "yesil");
    await user.click(within(sheet).getByRole("menuitem", { name: "Arşivle" }));
    expect(actions.archive).toHaveBeenCalledWith("n1");
  });

  it("dokunmatik sayfada Arşivle'den sonra ayraç ve en sonda kırmızı Sil var; Sil çöpe atar", async () => {
    setMedia({ width: 834, coarse: true });
    const actions = fakeActions();
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={note()}
        view="notlar"
        href="/not/n1"
        actions={actions}
        onVersions={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ev tadilatı fikirleri: işlemler" }));
    const sheet = await screen.findByRole("dialog");
    const items = within(within(sheet).getByRole("menu", { name: "Not işlemleri" })).getAllByRole(
      "menuitem",
    );
    expect(items.at(-2)).toHaveTextContent("Arşivle");
    const sil = items.at(-1)!;
    expect(sil).toHaveTextContent("Sil");
    expect(sil).toHaveClass("text-danger");
    expect(sil.previousElementSibling).toHaveAttribute("role", "separator");
    expect(within(sheet).queryByRole("menuitem", { name: "Çöpe at" })).toBeNull();
    await user.click(sil);
    expect(actions.trash).toHaveBeenCalledWith("n1");
  });
});

describe("ColorPalette", () => {
  it("10 renk sunar, seçili olanı işaretler ve seçimi bildirir", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorPalette value="turuncu" onChange={onChange} />);
    const buttons = within(screen.getByRole("group", { name: "Not rengi" })).getAllByRole("button");
    expect(buttons).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Turuncu, seçili" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Varsayılan" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Kahve" }));
    expect(onChange).toHaveBeenCalledWith("kahve");
  });
});

describe("Composer", () => {
  it("kapatınca başlık, renk ve sabitlemeyle kaydeder", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Not al…" }));
    await user.type(screen.getByLabelText("Not başlığı"), "Market listesi");
    await user.click(screen.getByRole("button", { name: "Sabitle" }));
    await user.click(screen.getByRole("button", { name: "Renk" }));
    await user.click(await screen.findByRole("button", { name: "Sarı" }));
    await user.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onSave).toHaveBeenCalledWith({
      kind: "text",
      title: "Market listesi",
      bodyHtml: "",
      tasks: [],
      color: "sari",
      pinned: true,
    });
    expect(screen.getByRole("button", { name: "Not al…" })).toBeInTheDocument();
  });

  it("boşsa kaydetmez", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Not al…" }));
    await user.type(screen.getByLabelText("Not başlığı"), "   ");
    await user.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc ve dışarı tıklama da kapatıp kaydeder", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <div>
        <p>dışarısı</p>
        <Composer onSave={onSave} />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Not al…" }));
    await user.type(screen.getByLabelText("Not başlığı"), "Bir");
    await user.keyboard("{Escape}");
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Bir" }));

    await user.click(screen.getByRole("button", { name: "Not al…" }));
    await user.type(screen.getByLabelText("Not başlığı"), "İki");
    await user.click(screen.getByText("dışarısı"));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ title: "İki" }));
  });

  it("gövde yazılınca HTML olarak kaydedilir", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Not al…" }));
    const body = await screen.findByRole("textbox", { name: "Not" });
    await user.click(body);
    await user.type(body, "Gövde metni");
    await user.click(screen.getByRole("button", { name: "Kapat" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].bodyHtml).toContain("Gövde metni");
  });

  it("biçimlendirme çubuğu varsayılan gizli; Aa açar ve kapatır, kalın uygulanır", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Not al…" }));
    const aa = screen.getByRole("button", { name: "Biçimlendirme" });
    expect(aa).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(aa.getAttribute("aria-controls")!)!;
    expect(panel).toHaveAttribute("inert");
    expect(within(panel).getByRole("toolbar", { name: "Biçimlendirme" })).toBeInTheDocument();
    await user.click(aa);
    expect(aa).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("inert");
    expect(panel).toHaveAttribute("data-open");
    const names = within(panel)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Kalın",
      "İtalik",
      "Üstü çizili",
      "Başlık",
      "Alt başlık",
      "Madde listesi",
      "Numaralı liste",
      "Bağlantı",
      "Biçimi temizle",
    ]);
    const body = await screen.findByRole("textbox", { name: "Not" });
    await user.click(body);
    await user.click(within(panel).getByRole("button", { name: "Kalın" }));
    await user.type(body, "kalın");
    await user.click(aa);
    expect(aa).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Kapat" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].bodyHtml).toContain("<strong>kalın</strong>");
  });

  it("yapılacaklar modunda Aa düğmesi yok", async () => {
    const user = userEvent.setup();
    render(<Composer onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Yeni yapılacaklar notu" }));
    expect(screen.queryByRole("button", { name: "Biçimlendirme" })).not.toBeInTheDocument();
  });
});

describe("toast ve geri al", () => {
  beforeEach(() => {
    toast.dismiss();
  });

  function setup(run: (a: NoteActions) => void) {
    const calls: Record<string, string>[] = [];
    function Page() {
      const actions = useNoteActions();
      return (
        <button type="button" onClick={() => run(actions)}>
          Eylem
        </button>
      );
    }
    const Stub = createRoutesStub([
      { path: "/", Component: Page },
      {
        path: "/api/notlar",
        action: async ({ request }) => {
          calls.push(Object.fromEntries(await request.formData()) as Record<string, string>);
          return { ok: true };
        },
      },
    ]);
    render(
      <>
        <Stub initialEntries={["/"]} />
        <Toaster />
      </>,
    );
    return calls;
  }

  it("arşivle toast'ı gösterir; 'Geri al' arşivden çıkarır", async () => {
    const user = userEvent.setup();
    const calls = setup((a) => a.archive("n1"));
    await user.click(screen.getByRole("button", { name: "Eylem" }));
    expect(await screen.findByText("Not arşivlendi")).toBeInTheDocument();
    await waitFor(() => expect(calls).toEqual([{ intent: "archive", id: "n1" }]));
    await user.click(screen.getByRole("button", { name: "Geri al" }));
    await waitFor(() => expect(calls[1]).toEqual({ intent: "unarchive", id: "n1" }));
  });

  it("çöpe at → geri al geri yükler; kopyasını oluştur → geri al kopyayı atar", async () => {
    const user = userEvent.setup();
    let copyId = "";
    const calls = setup((a) => {
      if (calls.length === 0) a.trash("n1");
      else copyId = a.duplicate("n1");
    });
    await user.click(screen.getByRole("button", { name: "Eylem" }));
    const trashToast = await screen.findByText("Not çöpe atıldı · 7 gün Çöp'te kalır");
    await user.click(
      within(trashToast.closest("[data-sonner-toast]")! as HTMLElement).getByRole("button", {
        name: "Geri al",
      }),
    );
    await waitFor(() => expect(calls[1]).toEqual({ intent: "restore", id: "n1" }));

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Eylem" }));
    });
    const copyToast = await screen.findByText("Kopyası oluşturuldu");
    await waitFor(() => expect(calls[2]).toMatchObject({ intent: "duplicate", id: "n1" }));
    expect(calls[2]!.newId).toBe(copyId);
    await user.click(
      within(copyToast.closest("[data-sonner-toast]")! as HTMLElement).getByRole("button", {
        name: "Geri al",
      }),
    );
    await waitFor(() => expect(calls[3]).toEqual({ intent: "discard", id: copyId }));
  });
});
