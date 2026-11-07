import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assigneeChipText,
  resolveAssignees,
  type Assignable,
  type TodoPeople,
} from "~/components/tasks/person-picker";
import { applyAssignOps, mergeOps } from "~/components/tasks/task-sync";
import { editorHandlesEscape } from "~/components/tasks/todo-editor";
import { setMedia } from "../../helpers/media";
import { initial } from "./ornek";
import { caretAt, fakeServer, renderEditor, titleInput } from "./editor-yardimci";

/**
 * Kişi seçici (PLAN §3 "Atama", prototip TodoNote "Kişiye ata", MTodoWho): yalnızca
 * proje notunda; Ctrl+Shift+A, ↑ / ↓, Enter seçer / kaldırır, Esc katmanlı kapatır.
 */

const NOW = new Date("2026-11-06T09:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const MEMBERS: Assignable[] = [
  { id: "ben", name: "Süleyman Kara", color: "#597895", isMe: true, viewer: false },
  { id: "ayse", name: "Ayşe Demir", color: "#B25D49", isMe: false, viewer: false },
  { id: "mehmet", name: "Mehmet Kaya", color: "#4976B4", isMe: false, viewer: false },
  { id: "zeynep", name: "Zeynep Arslan", color: "#7A5FB8", isMe: false, viewer: false },
  { id: "can", name: "Can Yılmaz", color: "#398264", isMe: false, viewer: true },
];
const PEOPLE: TodoPeople = { members: MEMBERS, canAssign: true };

const lastAssign = (calls: unknown[][]) =>
  calls
    .flat()
    .filter((o) => (o as { op: string }).op === "assign")
    .at(-1);

async function openWith(title: string) {
  const user = userEvent.setup();
  caretAt(titleInput(title), "end");
  await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
  const list = await screen.findByRole("listbox", { name: `Kişiye ata: ${title}` });
  return { user, list };
}

describe("kişi seçici", () => {
  it("Ctrl+Shift+A seçiciyi açar; odak ilk kişide (sen), ↓ gezinir, Enter atar", async () => {
    const server = fakeServer(initial(), {});
    renderEditor(initial(), { people: PEOPLE, initialAssignees: {} });
    const { user, list } = await openWith("SEO kontrolleri");
    const options = within(list).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "SKSüleyman Kara (sen)",
      "ADAyşe Demir",
      "MKMehmet Kaya",
      "ZAZeynep Arslan",
      "CYCan Yılmazgörüntüleyici · işaretleyemez",
    ]);
    await waitFor(() => expect(options[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(options[2]).toHaveFocus();
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(lastAssign(server.calls)).toEqual({ op: "assign", id: "t3", userIds: ["mehmet"] }),
    );
    expect(server.assignees()).toEqual({ t3: ["mehmet"] });
  });

  it("birden fazla kişi atanır, sıra üye sırasıdır (sen önce); Enter seçimi kaldırır", async () => {
    const server = fakeServer(initial(), {});
    renderEditor(initial(), { people: PEOPLE, initialAssignees: {} });
    const { user, list } = await openWith("SEO kontrolleri");
    const options = within(list).getAllByRole("option");
    await waitFor(() => expect(options[0]).toHaveFocus());
    // Önce Zeynep, sonra sen: gönderilen liste yine "sen" önce.
    await user.keyboard("{End}{ArrowUp}{Enter}{Home}{Enter}");
    await waitFor(() =>
      expect(lastAssign(server.calls)).toEqual({
        op: "assign",
        id: "t3",
        userIds: ["ben", "zeynep"],
      }),
    );
    // Satırda sessiz ipucu avatarları.
    const row = titleInput("SEO kontrolleri").closest("[data-task-row]") as HTMLElement;
    expect(within(row).getByText("Atananlar: Süleyman Kara, Zeynep Arslan")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(server.assignees()).toEqual({ t3: ["zeynep"] }));
    // Fareyle de seçilir; görüntüleyici atanabilir.
    await user.click(options[4]!);
    await waitFor(() => expect(server.assignees()).toEqual({ t3: ["zeynep", "can"] }));
  });

  it("Esc seçiciyi kapatır ve odak satıra döner; Esc not diyaloğuna ulaşmaz (katmanlı)", async () => {
    fakeServer(initial(), {});
    renderEditor(initial(), { people: PEOPLE, initialAssignees: {} });
    const { user, list } = await openWith("İçerik yazımı");
    const dialog = list.closest("[role=dialog]")!;
    expect(dialog).toHaveAttribute("aria-label", "Kişiye ata");
    expect(editorHandlesEscape(within(list).getAllByRole("option")[0]!)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await waitFor(() => expect(titleInput("İçerik yazımı")).toHaveFocus());
    // Satırda Esc önce seçiciyi kapatır, sonra listeden çıkar.
    await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("satırdaki kişi simgesi ve ayrıntıdaki kişi çipi seçiciyi açar; çip atananları yazar", async () => {
    fakeServer(initial(), { t2: ["zeynep", "mehmet"] });
    const user = userEvent.setup();
    renderEditor(initial(), {
      people: PEOPLE,
      initialAssignees: { t2: ["mehmet", "zeynep"] },
    });
    const row = titleInput("İçerik yazımı").closest("[data-task-row]") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Kişiye ata" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await user.click(within(row).getByRole("button", { name: "Ayrıntılar" }));
    const chip = await screen.findByRole("button", {
      name: "Atananlar: Mehmet Kaya, Zeynep Arslan",
    });
    expect(chip).toHaveTextContent("Mehmet, Zeynep");
    await user.click(chip);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("mobilde kişi alttan açılan sayfada seçilir; Bitti kapatır", async () => {
    setMedia({ width: 390, coarse: true });
    const server = fakeServer(initial(), {});
    const user = userEvent.setup();
    renderEditor(initial(), { people: PEOPLE, initialAssignees: {} });
    await user.click(titleInput("SEO kontrolleri"));
    const toolbar = await screen.findByRole("toolbar", { name: "Görev araçları" });
    await user.click(within(toolbar).getByRole("button", { name: "Kişiye ata" }));
    const sheet = await screen.findByRole("dialog", { name: "Kişiye ata" });
    expect(within(sheet).getByText("SEO kontrolleri")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("option", { name: /Ayşe Demir/ }));
    await waitFor(() => expect(server.assignees()).toEqual({ t3: ["ayse"] }));
    await user.click(within(sheet).getByRole("button", { name: "Bitti" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Kişiye ata" })).not.toBeInTheDocument(),
    );
  });

  it("kişisel notta atama arayüzü yoktur: Ctrl+Shift+A bir şey açmaz, kişi simgesi yok", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
    await act(async () => {});
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kişiye ata" })).not.toBeInTheDocument();
  });

  it("atama yetkisi yoksa seçici açılmaz ama atananlar görünür", async () => {
    fakeServer(initial(), { t3: ["can"] });
    const user = userEvent.setup();
    renderEditor(initial(), {
      people: { members: MEMBERS, canAssign: false },
      initialAssignees: { t3: ["can"] },
    });
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Control>}{Shift>}A{/Shift}{/Control}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("Atananlar: Can Yılmaz")).toBeInTheDocument();
  });
});

describe("atama yardımcıları", () => {
  it("atama işlemleri haritaya tam liste olarak uygulanır; boş liste atamayı kaldırır", () => {
    const start = { a: ["u1"] };
    expect(
      applyAssignOps(start, [
        { op: "assign", id: "b", userIds: ["u2", "u3"] },
        { op: "assign", id: "a", userIds: [] },
        { op: "complete", id: "b", completed: true },
      ]),
    ).toEqual({ b: ["u2", "u3"] });
    expect(start).toEqual({ a: ["u1"] });
    expect(applyAssignOps(start, [])).toBe(start);
  });

  it("aynı görevin ardışık atamaları kuyrukta tek işleme iner", () => {
    expect(
      mergeOps(
        [{ op: "assign", id: "a", userIds: ["u1"] }],
        [
          { op: "assign", id: "a", userIds: ["u1", "u2"] },
          { op: "assign", id: "b", userIds: ["u3"] },
        ],
      ),
    ).toEqual([
      { op: "assign", id: "a", userIds: ["u1", "u2"] },
      { op: "assign", id: "b", userIds: ["u3"] },
    ]);
  });

  it("çip metni ilk adları yazar, sen için 'Sen'; üye olmayan atama atlanır", () => {
    expect(assigneeChipText([])).toBe("Kişiye ata");
    expect(assigneeChipText(resolveAssignees(["zeynep", "ben", "eski-uye"], MEMBERS))).toBe(
      "Sen, Zeynep",
    );
    expect(resolveAssignees(undefined, MEMBERS)).toEqual([]);
  });
});
