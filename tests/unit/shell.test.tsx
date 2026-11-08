import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { AppShell } from "~/components/shell/app-shell";
import { ViewSwitch } from "~/components/shell/view-switch";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { ShellData } from "~/components/shell/types";
import { NAV_STORAGE_KEY, THEME_STORAGE_KEY } from "~/lib/theme";
import { hesaplar } from "../fixtures/hesaplar";
import { ornekProjeler } from "../fixtures/ornek-veri";
import { setMedia } from "../helpers/media";

const shellData: ShellData = {
  user: {
    name: hesaplar.ayse.ad,
    email: hesaplar.ayse.eposta,
    avatarColor: hesaplar.ayse.avatarRengi,
  },
  projects: ornekProjeler.map(({ id, ad, renk }) => ({ id, name: ad, color: renk })),
  deletedProjectCount: 0,
  pendingInviteCount: 1,
  unreadNotificationCount: 2,
};

function renderShell(path = "/") {
  const Page = () => (
    <AppShell {...shellData} showViewSwitch>
      <h1>Notlarım</h1>
    </AppShell>
  );
  const Stub = createRoutesStub([
    { path: "/", Component: Page },
    { path: "/arsiv", Component: Page },
  ]);
  // Uygulamada ipuçlarının sağlayıcısı kökte (`root.tsx`).
  return render(
    <TooltipProvider>
      <Stub initialEntries={[path]} />
    </TooltipProvider>,
  );
}

describe("uygulama kabuğu", () => {
  it("ana gezinmeyi, aramayı ve projeleri gösterir", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Ana gezinme" });
    expect(within(nav).getByRole("link", { name: "Notlarım" })).toHaveAttribute("href", "/");
    for (const project of shellData.projects) {
      expect(within(nav).getByRole("link", { name: project.name })).toBeInTheDocument();
    }
    expect(within(screen.getByRole("search")).getByLabelText("Ara")).toHaveAttribute(
      "id",
      "genel-arama",
    );
    expect(screen.getByRole("heading", { name: "Notlarım" })).toBeInTheDocument();
  });

  it("masaüstünde sol üstteki logo menü düğmesidir: paneli raya geçirir ve geri açar", async () => {
    const user = userEvent.setup();
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Ana gezinme" });
    const menu = within(nav).getByRole("button", { name: "Menüyü kapat" });
    expect(menu).toHaveAttribute("aria-expanded", "true");
    // "sukano" yazısı ana sayfa bağlantısı olarak kalır.
    expect(within(nav).getByRole("link", { name: "Sukano, ana sayfa" })).toHaveAttribute(
      "href",
      "/",
    );

    await user.click(menu);
    expect(document.documentElement).toHaveAttribute("data-nav", "rail");
    expect(localStorage.getItem(NAV_STORAGE_KEY)).toBe("rail");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAccessibleName("Menüyü aç");

    // Klavyeyle de çalışır.
    menu.focus();
    await user.keyboard("{Enter}");
    expect(document.documentElement).toHaveAttribute("data-nav", "open");
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveAccessibleName("Menüyü kapat");
  });

  it("tablette logo çekmeceyi açar, çekmecedeki logo kapatır", async () => {
    setMedia({ width: 834 });
    const user = userEvent.setup();
    renderShell();
    const menu = within(screen.getByRole("navigation", { name: "Ana gezinme" })).getByRole(
      "button",
      { name: "Menüyü aç" },
    );
    await user.click(menu);
    const drawer = await screen.findByRole("dialog", { name: "Ana gezinme" });
    expect(menu).toHaveAttribute("aria-expanded", "true");
    await user.click(within(drawer).getByRole("button", { name: "Menüyü kapat" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute("data-nav", "rail");
  });

  it("mobilde hamburger gezinme çekmecesini açar, panel durumu değişmez", async () => {
    setMedia({ width: 390 });
    const user = userEvent.setup();
    renderShell();
    const menu = screen.getByRole("button", { name: "Gezinme menüsü" });
    expect(menu).toHaveAttribute("aria-expanded", "false");

    await user.click(menu);
    const drawer = await screen.findByRole("dialog", { name: "Ana gezinme" });
    expect(within(drawer).getByRole("link", { name: "Davetler, 1 bekleyen davet" })).toBeVisible();
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(document.documentElement).not.toHaveAttribute("data-nav", "rail");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hesap menüsü açılır; Tema, Ayarlar ve Çıkış yap seçenekleri vardır", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Hesap menüsü" }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText(shellData.user.email)).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Tema" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Ayarlar" })).toHaveAttribute(
      "href",
      "/ayarlar",
    );
    expect(within(menu).getByRole("menuitem", { name: "Çıkış yap" })).toBeInTheDocument();
  });

  it("hesap menüsündeki Tema alt menüsünden Koyu seçilince tema kalıcı olarak değişir", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Hesap menüsü" }));
    // Alt menü klavyeyle açılır: Tema'ya odaklan, → ile aç, Koyu'yu Enter ile seç.
    (await screen.findByRole("menuitem", { name: "Tema" })).focus();
    await user.keyboard("{ArrowRight}");

    const dark = await screen.findByRole("menuitemradio", { name: "Koyu" });
    expect(screen.getByRole("menuitemradio", { name: "Sistem" })).toBeChecked();
    dark.focus();
    await user.keyboard("{Enter}");

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("görünüm seçicide yalnızca etkin görünümün etiketi gösterilir, diğerleri ipuçlu ikon", async () => {
    const Stub = createRoutesStub([{ path: "/arsiv", Component: () => <ViewSwitch /> }]);
    render(
      <TooltipProvider>
        <Stub initialEntries={["/arsiv"]} />
      </TooltipProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Görünüm" });
    const active = within(nav).getByRole("link", { name: "Arşiv" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-etkin");
    for (const name of ["Notlar", "Çöp"]) {
      const link = within(nav).getByRole("link", { name });
      expect(link).not.toHaveAttribute("data-etkin");
      expect(link).not.toHaveAttribute("aria-current");
    }
    // Etiket metni yalnızca görsel; erişilebilir ad aria-label'dan gelir, title yok.
    expect(active).not.toHaveAttribute("title");
  });
});
