import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NAV_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  themeInitScript,
  useTheme,
} from "~/lib/theme";
import { setMedia } from "../helpers/media";

const root = () => document.documentElement;

/** FOUC önleyici satır içi betiği tarayıcıdaki gibi çalıştırır. */
function runInitScript() {
  new Function(themeInitScript)();
}

describe("resolveTheme: tercih + sistem → sonuç", () => {
  it.each([
    { pref: "light", dark: false, expected: "light" },
    { pref: "light", dark: true, expected: "light" },
    { pref: "dark", dark: false, expected: "dark" },
    { pref: "dark", dark: true, expected: "dark" },
    { pref: "system", dark: false, expected: "light" },
    { pref: "system", dark: true, expected: "dark" },
  ] as const)(
    "tercih '$pref' ve sistem koyu=$dark iken '$expected' çözümlenir",
    ({ pref, dark, expected }) => {
      setMedia({ dark });
      expect(resolveTheme(pref)).toBe(expected);
    },
  );

  it("sistem tercihi koyuysa ve tercih 'system' ise koyu çözümlenir", () => {
    setMedia({ dark: true });
    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("getThemePreference", () => {
  it("kayıtlı tercih yoksa 'system' döner", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("geçerli kayıtlı tercihi döner", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getThemePreference()).toBe("dark");
  });

  it("geçersiz kayıtlı değeri yok sayar ve 'system' döner", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "mor");
    expect(getThemePreference()).toBe("system");
  });

  it("localStorage erişilemezse 'system' döner", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(getThemePreference()).toBe("system");
  });
});

describe("applyTheme ve setThemePreference", () => {
  it("çözümlenen temayı ve tercihi <html> özniteliklerine yazar", () => {
    setMedia({ dark: true });
    applyTheme("system");
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(root()).toHaveAttribute("data-theme-pref", "system");
    expect(root().style.colorScheme).toBe("dark");
  });

  it("açık ya da koyu tercih localStorage'a kaydedilir", () => {
    setThemePreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("'system' seçilince kayıtlı tercih silinir", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    setThemePreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(root()).toHaveAttribute("data-theme", "light");
  });

  it("localStorage yazılamasa bile tema uygulanır", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("kota");
    });
    setThemePreference("dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
  });
});

describe("themeInitScript (FOUC önleyici)", () => {
  it("kayıt yokken sistem şemasını uygular ve paneli açık başlatır", () => {
    setMedia({ dark: true });
    runInitScript();
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(root()).toHaveAttribute("data-theme-pref", "system");
    expect(root()).toHaveAttribute("data-nav", "open");
  });

  it("kayıtlı açık tercih ve ray durumunu uygular", () => {
    setMedia({ dark: true });
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    localStorage.setItem(NAV_STORAGE_KEY, "rail");
    runInitScript();
    expect(root()).toHaveAttribute("data-theme", "light");
    expect(root()).toHaveAttribute("data-nav", "rail");
  });

  it("localStorage hata verirse sessizce geçer", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(runInitScript).not.toThrow();
    expect(root()).not.toHaveAttribute("data-theme");
  });
});

describe("useTheme", () => {
  it("varsayılan olarak sistem tercihini ve çözümlenen temayı verir", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
    expect(result.current.resolved).toBe("light");
  });

  it("setPreference ile seçilen tema hemen yansır", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("dark"));
    expect(result.current).toMatchObject({ preference: "dark", resolved: "dark" });
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("tercih 'system' iken sistem şeması değişince tema güncellenir", () => {
    const { result } = renderHook(() => useTheme());
    act(() => setMedia({ dark: true }));
    expect(result.current.resolved).toBe("dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("açık tercih varken sistem şeması değişse de tema açık kalır", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    applyTheme("light");
    const { result } = renderHook(() => useTheme());
    act(() => setMedia({ dark: true }));
    expect(result.current.resolved).toBe("light");
    expect(root()).toHaveAttribute("data-theme", "light");
  });

  it("başka sekmede tema değişince (storage olayı) uyum sağlar", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(result.current.preference).toBe("dark");
    expect(root()).toHaveAttribute("data-theme", "dark");
  });

  it("ilgisiz storage olaylarını yok sayar", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "baska-anahtar" }));
    });
    expect(root()).not.toHaveAttribute("data-theme");
    expect(result.current.preference).toBe("system");
  });

  it("bileşen kaldırılınca dinleyiciler temizlenir", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useTheme());
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});
