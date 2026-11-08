import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { installMatchMedia, resetMedia } from "./helpers/media";

// Radix bileşenlerinin jsdom'da eksik bulduğu tarayıcı API'leri.
if (typeof window !== "undefined") {
  installMatchMedia();

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.setPointerCapture ??= () => {};
  // ProseMirror (Tiptap) seçimi kaydırırken metin aralıklarının konumunu sorar.
  const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= emptyRects;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  document.elementFromPoint ??= () => null;
}

beforeEach(() => {
  if (typeof window === "undefined") return;
  resetMedia();
  installMatchMedia();
  window.localStorage.clear();
  const root = document.documentElement;
  for (const attr of ["data-theme", "data-theme-pref", "data-nav", "data-motion", "style"]) {
    root.removeAttribute(attr);
  }
});

afterEach(() => {
  if (typeof window !== "undefined") cleanup();
});
