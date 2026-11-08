import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, Outlet, RouterProvider, useLoaderData } from "react-router";
import { describe, expect, it } from "vitest";
import { noteIdFromPath } from "~/components/notes/note-links";
import { PendingNotePreview } from "~/components/notes/note-preview";
import type { NoteCardData } from "~/domain/notes/optimistic";

const kart = (o: Partial<NoteCardData> = {}): NoteCardData => ({
  id: "market",
  kind: "text",
  title: "Market",
  color: "sari",
  pinned: false,
  position: 1,
  preview: "Süt, ekmek",
  tasks: [],
  moreTasks: 0,
  updatedAt: "2026-11-01T10:00:00.000Z",
  archivedAt: null,
  trashedAt: null,
  ...o,
});

function setup(notes: NoteCardData[]) {
  let resolve: (v: string) => void = () => {};
  const router = createMemoryRouter([
    {
      path: "/",
      Component: () => (
        <>
          <Link to="/not/market">Market</Link>
          <Link to="/not/liste">Liste</Link>
          <Link to="/baska">Başka</Link>
          <Outlet />
          <PendingNotePreview notes={notes} />
        </>
      ),
      children: [
        {
          path: "not/:id",
          loader: () => new Promise<string>((r) => (resolve = r)),
          Component: () => <p>Düzenleyici: {useLoaderData<string>()}</p>,
        },
        { path: "baska", loader: () => new Promise(() => {}), Component: () => null },
      ],
    },
  ]);
  render(<RouterProvider router={router} />);
  return { router, finish: (v: string) => act(async () => resolve(v)) };
}

describe("not önizlemesi (yükleme sürerken)", () => {
  it("kart tıklanınca not modalı loader bitmeden kart verisiyle açılır", async () => {
    const { finish } = setup([kart()]);
    await userEvent.click(screen.getByRole("link", { name: "Market" }));
    const dialog = await screen.findByRole("dialog", { name: "Market" });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(dialog).toHaveTextContent("Süt, ekmek");
    await finish("market");
    expect(await screen.findByText("Düzenleyici: market")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("yapılacaklar notunun görevleri önizlemede görünür", async () => {
    setup([
      kart({
        id: "liste",
        kind: "todo",
        title: "",
        preview: "",
        tasks: [{ id: "g1", title: "Kutuları al", done: false }],
      }),
    ]);
    await userEvent.click(screen.getByRole("link", { name: "Liste" }));
    const dialog = await screen.findByRole("dialog", { name: "Başlıksız not" });
    expect(dialog).toHaveTextContent("Kutuları al");
  });

  it("ızgarada olmayan not ya da başka sayfa için önizleme açılmaz", async () => {
    setup([]);
    await userEvent.click(screen.getByRole("link", { name: "Market" }));
    await userEvent.click(screen.getByRole("link", { name: "Başka" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("önizleme kapatılınca bekleyen gezinme iptal edilir", async () => {
    const { router } = setup([kart()]);
    await userEvent.click(screen.getByRole("link", { name: "Market" }));
    await userEvent.click(await screen.findByRole("button", { name: "Kapat" }));
    await act(async () => {});
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.navigation.state).toBe("idle");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("adresteki not kimliği", () => {
  it("not alt yolundan kimliği okur", () => {
    expect(noteIdFromPath("/not/market")).toBe("market");
    expect(noteIdFromPath("/proje/p/arsiv/not/a%20b/")).toBe("a b");
    expect(noteIdFromPath("/arsiv")).toBeNull();
    expect(noteIdFromPath("/not/%E0%A4%A")).toBeNull();
  });
});
