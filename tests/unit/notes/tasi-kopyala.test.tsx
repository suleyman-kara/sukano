import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createRoutesStub } from "react-router";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoveCopyDialog, type MoveCopyDialogProps } from "~/components/notes/move-copy";
import type { MoveTarget } from "~/components/notes/note-access";
import { closeHref, noteHref } from "~/components/notes/note-links";

/**
 * "Taşı veya kopyala…" (kişisel not) ve "Kopyala…" (proje notu) diyalogları (Dialogs,
 * Dialogs2, MMove): sekmeler, yetkiye göre süzme, istekler ve 10 sn "Geri al" toast'ı.
 */

const TARGETS: MoveTarget[] = [
  { id: "ev", name: "Ev Taşınma", color: "mavi", role: "yonetici" },
  { id: "web", name: "Web Sitesi Yenileme", color: "turuncu", role: "duzenleyici" },
  { id: "kitap", name: "Kitap Kulübü", color: "yesil", role: "goruntuleyici" },
];

type Call = Record<string, string>;
let calls: Call[];
let reply: (form: Call) => { status?: number; body: unknown };

beforeEach(() => {
  calls = [];
  reply = () => ({ body: { ok: true } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const form = Object.fromEntries(new URLSearchParams(String(init?.body))) as Call;
      calls.push(form);
      const r = reply(form);
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Sonner'ın deposu testler arasında paylaşılır: en son çıkan toast. */
async function lastText(text: string) {
  return (await screen.findAllByText(text)).at(-1)!;
}

function setup(props: Partial<MoveCopyDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onMoved = vi.fn();
  const onCopied = vi.fn();
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: function Page() {
        const [open, setOpen] = useState(true);
        return (
          <MoveCopyDialog
            open={open}
            onOpenChange={(o) => {
              onOpenChange(o);
              setOpen(o);
            }}
            note={{ id: "n1", title: "Ev tadilatı fikirleri", color: "turuncu" }}
            source={{ kind: "personal" }}
            targets={TARGETS}
            onMoved={onMoved}
            onCopied={onCopied}
            {...props}
          />
        );
      },
    },
    { path: "/not/:id", Component: () => <p>Kopya açıldı</p> },
  ]);
  render(
    <>
      <Stub initialEntries={["/"]} />
      <Toaster />
    </>,
  );
  return { onOpenChange, onMoved, onCopied, user: userEvent.setup() };
}

describe("Taşı veya kopyala… (kişisel not)", () => {
  it("Taşı sekmesi açılır; görüntüleyici olunan proje seçilemez, ilk yazılabilir proje seçili", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Notu projeye taşı" });
    expect(within(dialog).getByRole("tab", { name: "Taşı" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const group = within(dialog).getByRole("radiogroup", { name: "Hedef proje" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "Ev TaşınmaYönetici",
      "Web Sitesi YenilemeDüzenleyici",
      "Kitap KulübüGörüntüleyici, not ekleyemez",
    ]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[2]).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByRole("button", { name: "Ev Taşınma projesine taşı" })).toBeEnabled();
    expect(dialog).toHaveTextContent("10 sn içinde toast'tan geri alabilirsin");
  });

  it("oklarla seçim değişir, görüntüleyici projesi atlanır; tıklama da seçmez", async () => {
    const { user } = setup();
    const group = screen.getByRole("radiogroup", { name: "Hedef proje" });
    const [ev, web, kitap] = within(group).getAllByRole("radio");
    ev!.focus();
    await user.keyboard("{ArrowDown}");
    expect(web).toHaveAttribute("aria-checked", "true");
    expect(web).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(web).toHaveAttribute("aria-checked", "true");
    await user.click(kitap!);
    expect(kitap).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("button", { name: "Web Sitesi Yenileme projesine taşı" }),
    ).toBeVisible();
  });

  it("taşır, 10 sn'lik toast'taki Geri al taşımayı geri alır", async () => {
    const { user, onMoved, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Ev Taşınma projesine taşı" }));
    await waitFor(() =>
      expect(calls[0]).toEqual({ intent: "move-to-project", id: "n1", projectId: "ev" }),
    );
    expect(onMoved).toHaveBeenCalledWith({ id: "ev", name: "Ev Taşınma", color: "mavi" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const toastEl = (await lastText("Not Ev Taşınma projesine taşındı")).closest(
      "[data-sonner-toast]",
    ) as HTMLElement;
    await user.click(within(toastEl).getByRole("button", { name: "Geri al" }));
    await waitFor(() => expect(calls[1]).toEqual({ intent: "undo-move", id: "n1" }));
    expect(await screen.findByText("Taşıma geri alındı; not Notlarım'a döndü")).toBeVisible();
  });

  it("pencere geçtiyse Geri al sunucunun hatasını gösterir", async () => {
    reply = (f) =>
      f.intent === "undo-move"
        ? { status: 409, body: { ok: false, error: "Taşıma kesinleşti; artık geri alınamaz." } }
        : { body: { ok: true } };
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Ev Taşınma projesine taşı" }));
    const toastEl = (await lastText("Not Ev Taşınma projesine taşındı")).closest(
      "[data-sonner-toast]",
    ) as HTMLElement;
    await user.click(within(toastEl).getByRole("button", { name: "Geri al" }));
    expect(await screen.findByText("Taşıma kesinleşti; artık geri alınamaz.")).toBeVisible();
  });

  it("taşıma reddedilirse diyalog açık kalır ve hata gösterilir", async () => {
    reply = () => ({ status: 403, body: { ok: false, error: "Bu işlem için yetkin yok." } });
    const { user, onMoved, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Ev Taşınma projesine taşı" }));
    expect(await screen.findByText("Bu işlem için yetkin yok.")).toBeVisible();
    expect(onMoved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Kopyala sekmesi: Kişisel alanım seçili; projeye kopyalanır ve toast'tan kopya açılır", async () => {
    const before = vi.fn(async () => {});
    const { user, onCopied } = setup({ before });
    await user.click(screen.getByRole("tab", { name: "Kopyala" }));
    const dialog = screen.getByRole("dialog", { name: "Notu kopyala" });
    const group = within(dialog).getByRole("radiogroup", { name: "Kopyanın yeri" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "Kişisel alanımNotlarım",
      "Ev TaşınmaYönetici",
      "Web Sitesi YenilemeDüzenleyici",
      "Kitap KulübüGörüntüleyici, not ekleyemez",
    ]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("button", { name: "Kişisel alanıma kopyala" })).toBeVisible();
    await user.click(radios[2]!);
    await user.click(
      within(dialog).getByRole("button", { name: "Web Sitesi Yenileme projesine kopyala" }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(before).toHaveBeenCalled();
    expect(calls[0]).toMatchObject({ intent: "copy-to", id: "n1", projectId: "web" });
    expect(calls[0]!.newId).toMatch(/^[0-9a-f-]{36}$/);
    expect(onCopied).toHaveBeenCalled();
    expect(
      await screen.findByText("Kopya Web Sitesi Yenileme projesinde oluşturuldu"),
    ).toBeVisible();
  });

  it("sekmeler ←/→ ile değişir", async () => {
    const { user } = setup();
    const tab = screen.getByRole("tab", { name: "Taşı" });
    tab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Kopyala" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Kopyala" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Sürüm geçmişi kopyalanmaz");
  });

  it("hiç projesi olmayan için taşıma açıklaması gösterilir, düğme devre dışı", () => {
    setup({ targets: [] });
    expect(screen.getByText(/Henüz bir projen yok/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Projeye taşı" })).toBeDisabled();
  });
});

describe("Kopyala… (proje notu)", () => {
  it("sekme yok; kendi projesi listede değil, kişisel alana kopyalanır ve Aç kopyayı açar", async () => {
    const { user } = setup({
      source: {
        kind: "project",
        project: { id: "web", name: "Web Sitesi Yenileme", color: "turuncu" },
      },
      note: { id: "n2", title: "Lansman hazırlığı", color: "default" },
    });
    const dialog = screen.getByRole("dialog", { name: "Notu kopyala" });
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Web Sitesi Yenileme");
    expect(dialog).toHaveTextContent("Proje notu taşınamaz, yalnızca kopyalanır.");
    const radios = within(dialog).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "Kişisel alanımNotlarım",
      "Ev TaşınmaYönetici",
      "Kitap KulübüGörüntüleyici, not ekleyemez",
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Kişisel alanıma kopyala" }));
    await waitFor(() => expect(calls[0]).toMatchObject({ intent: "copy-to", id: "n2" }));
    expect(calls[0]!.projectId).toBeUndefined();
    const toastEl = (await lastText("Kopya Notlarım'da oluşturuldu")).closest(
      "[data-sonner-toast]",
    ) as HTMLElement;
    await user.click(within(toastEl).getByRole("button", { name: "Aç" }));
    expect(await screen.findByText("Kopya açıldı")).toBeVisible();
  });
});

describe("not adresleri", () => {
  it("kişisel ve proje notunun adresi, arşivde arşiv yolu", () => {
    expect(noteHref({ id: "a", projectId: null })).toBe("/not/a");
    expect(noteHref({ id: "a", projectId: null, archived: true })).toBe("/arsiv/not/a");
    expect(noteHref({ id: "a", projectId: "p" })).toBe("/proje/p/not/a");
    expect(noteHref({ id: "a", projectId: "p", archived: true })).toBe("/proje/p/arsiv/not/a");
  });

  it("kapanınca yoldaki /not/:id atılır, arama sorgusu korunur, ?surumler atılır", () => {
    expect(closeHref("/not/a")).toBe("/");
    expect(closeHref("/arsiv/not/a")).toBe("/arsiv");
    expect(closeHref("/proje/p/arsiv/not/a", "?surumler")).toBe("/proje/p/arsiv");
    expect(closeHref("/ara/not/a", "?q=teklif&kaynak=web")).toBe("/ara?q=teklif&kaynak=web");
  });
});
