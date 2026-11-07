import { expect, type Page, type TestInfo } from "@playwright/test";

export type Gorunum = "masaustu" | "tablet" | "mobil";

export function gorunum(testInfo: TestInfo): Gorunum {
  return testInfo.project.name as Gorunum;
}

/**
 * Sayfayı açar ve React'in hidrasyonu bitene kadar bekler: sunucuda çizilen
 * düğmeler hidrasyondan önce tıklamaya tepki vermez.
 */
export async function ac(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
}
