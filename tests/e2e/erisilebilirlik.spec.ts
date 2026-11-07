import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ac } from "./yardimcilar";

const SAYFALAR = [
  { ad: "Notlarım", yol: "/" },
  { ad: "Giriş", yol: "/giris" },
] as const;

async function ciddiIhlaller(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ kural: v.id, etki: v.impact, ozet: v.help, ornekler: v.nodes.length }));
}

test.describe("erişilebilirlik (axe)", () => {
  for (const { ad, yol } of SAYFALAR) {
    for (const tema of ["light", "dark"] as const) {
      test(
        `${ad} (${yol}) ${tema === "light" ? "açık" : "koyu"} temada kritik ya da ciddi ihlal içermez`,
        {
          tag: tema === "light" ? "@duman" : undefined,
        },
        async ({ page }) => {
          await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
          await ac(page, yol);
          await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
          expect(await ciddiIhlaller(page)).toEqual([]);
        },
      );
    }
  }
});
