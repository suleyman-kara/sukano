// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useNavMode } from "~/lib/nav-state";
import { getThemePreference, resolveTheme, useTheme } from "~/lib/theme";

/** SSR sırasında `window`/`document` yoktur; modüller güvenli varsayılan döner. */
describe("sunucu ortamında (SSR)", () => {
  it("tema tercihi 'system' kabul edilir", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("'system' tercihi açık temaya çözümlenir", () => {
    expect(resolveTheme("system")).toBe("light");
  });

  it("açıkça seçilmiş tercih olduğu gibi döner", () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("kancalar sunucu anlık görüntüsüyle çizilir: sistem/açık tema, açık panel", () => {
    function Probe() {
      const { preference, resolved } = useTheme();
      const { mode } = useNavMode();
      return <output>{`${preference}|${resolved}|${mode}`}</output>;
    }
    expect(renderToString(<Probe />)).toContain("system|light|open");
  });
});
