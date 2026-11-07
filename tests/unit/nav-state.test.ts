import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setNavMode, useNavMode } from "~/lib/nav-state";
import { NAV_STORAGE_KEY } from "~/lib/theme";

const root = () => document.documentElement;

describe("sol panel durumu (nav-state)", () => {
  it("öznitelik yokken panel açık kabul edilir", () => {
    const { result } = renderHook(() => useNavMode());
    expect(result.current.mode).toBe("open");
  });

  it("<html data-nav='rail'> ise ray durumunda başlar", () => {
    root().setAttribute("data-nav", "rail");
    const { result } = renderHook(() => useNavMode());
    expect(result.current.mode).toBe("rail");
  });

  it("setNavMode özniteliği ve localStorage'ı günceller", () => {
    setNavMode("rail");
    expect(root()).toHaveAttribute("data-nav", "rail");
    expect(localStorage.getItem(NAV_STORAGE_KEY)).toBe("rail");
  });

  it("toggle açık ↔ ray arasında geçiş yapar ve bileşen yeniden çizilir", () => {
    const { result } = renderHook(() => useNavMode());
    act(() => result.current.toggle());
    expect(result.current.mode).toBe("rail");
    expect(localStorage.getItem(NAV_STORAGE_KEY)).toBe("rail");
    act(() => result.current.toggle());
    expect(result.current.mode).toBe("open");
    expect(root()).toHaveAttribute("data-nav", "open");
  });

  it("setMode ile doğrudan durum verilebilir", () => {
    const { result } = renderHook(() => useNavMode());
    act(() => result.current.setMode("rail"));
    expect(result.current.mode).toBe("rail");
  });

  it("localStorage yazılamasa bile durum değişir", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("kota");
    });
    setNavMode("rail");
    expect(root()).toHaveAttribute("data-nav", "rail");
  });

  it("bileşen kaldırılınca dinleyici temizlenir", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useNavMode());
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
