import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CROSSFADE_MS,
  enteredFromPreview,
  rememberCardOrigin,
  useCardToModalEnter,
} from "~/components/notes/card-to-modal";

/** `animate` çağrılarını kaydeden sahte öğe (jsdom Web Animations bilmez). */
function fakeElement(children = 0) {
  const el = document.createElement("div");
  for (let i = 0; i < children; i++) el.appendChild(document.createElement("div"));
  const calls: { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  const anim = { currentTime: 0 } as unknown as Animation;
  const spy = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options });
    return anim;
  };
  el.animate = spy as unknown as typeof el.animate;
  for (const c of Array.from(el.children)) (c as HTMLElement).animate = spy as never;
  return { el, calls, anim };
}

const card = () => {
  const c = document.createElement("article");
  c.getBoundingClientRect = () => new DOMRect(10, 20, 200, 120);
  return c;
};

describe("karttan modala geçiş (önizleme ile)", () => {
  it("önizleme karttan büyür; gerçek diyalog hareketi kaldığı yerden sürdürür", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    rememberCardOrigin("a", card());
    const preview = fakeElement();
    renderHook(() => useCardToModalEnter("a", false, { preview: true })).result.current(preview.el);
    expect(preview.calls).toHaveLength(1);
    expect(String(preview.calls[0]!.keyframes[0]!.transform)).toContain("translate(");
    expect(enteredFromPreview("a")).toBe(true);

    vi.spyOn(performance, "now").mockReturnValue(1100);
    const real = fakeElement();
    renderHook(() => useCardToModalEnter("a", false)).result.current(real.el);
    expect(real.calls).toHaveLength(1);
    expect(String(real.calls[0]!.keyframes[0]!.transform)).toContain("translate(");
    expect(real.anim.currentTime).toBe(100);
    expect(enteredFromPreview("a")).toBe(false);
  });

  it("hareket bittiyse gerçek diyalogun içeriği çapraz geçişle gelir", () => {
    vi.spyOn(performance, "now").mockReturnValue(5000);
    rememberCardOrigin("b", card());
    renderHook(() => useCardToModalEnter("b", false, { preview: true })).result.current(
      fakeElement().el,
    );
    vi.spyOn(performance, "now").mockReturnValue(5600);
    const real = fakeElement(2);
    renderHook(() => useCardToModalEnter("b", false)).result.current(real.el);
    expect(real.calls).toHaveLength(2);
    expect(real.calls.every((c) => c.options.duration === CROSSFADE_MS)).toBe(true);
    expect(real.calls[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it("azaltılmış harekette önizleme ve gerçek diyalog hareketsiz açılır", () => {
    rememberCardOrigin("c", card());
    const preview = fakeElement();
    renderHook(() => useCardToModalEnter("c", true, { preview: true })).result.current(preview.el);
    const real = fakeElement(1);
    renderHook(() => useCardToModalEnter("c", true)).result.current(real.el);
    expect(preview.calls).toHaveLength(0);
    expect(real.calls).toHaveLength(0);
  });

  it("önizlemesiz açılışta kart yoksa küçük ölçekle belirir", () => {
    const real = fakeElement();
    renderHook(() => useCardToModalEnter("d", false)).result.current(real.el);
    expect(real.calls[0]!.keyframes[0]).toMatchObject({ transform: "scale(0.96)", opacity: 0 });
  });
});
