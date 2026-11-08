import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { MotionPicker } from "~/components/settings/motion-settings";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import type { MotionPreference } from "~/lib/motion";
import { setMedia } from "../../helpers/media";

/** Ayarlar › Görünüm › "Hareketi azalt" (Sistem / Açık / Kapalı). */

function renderPicker(initial: MotionPreference, onSave = vi.fn()) {
  const Stub = createRoutesStub([
    {
      path: "/ayarlar",
      Component: () => <MotionPicker initial={initial} />,
      action: async ({ request }) => {
        const form = await request.formData();
        onSave(Object.fromEntries(form));
        return { ok: true };
      },
    },
  ]);
  render(<Stub initialEntries={["/ayarlar"]} />);
  return onSave;
}

describe("Hareketi azalt ayarı", () => {
  it("üç seçenek tek radyo grubu olarak gelir; kayıtlı tercih seçilidir", () => {
    renderPicker("reduced");
    const grup = screen.getByRole("radiogroup", { name: "Hareketi azalt" });
    expect(grup).toHaveAccessibleDescription(/Sistem, cihazının ayarına uyar/);
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Sistem",
      "Açık",
      "Kapalı",
    ]);
    expect(screen.getByRole("radio", { name: "Açık" })).toBeChecked();
  });

  it("seçim hemen <html data-motion>'a uygulanır ve sunucuya kaydedilir", async () => {
    const user = userEvent.setup();
    const onSave = renderPicker("system");
    await user.click(screen.getByRole("radio", { name: "Açık" }));
    expect(document.documentElement.dataset.motion).toBe("reduced");
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ intent: "motion", motion: "reduced" }),
    );
    expect(screen.getByRole("radio", { name: "Açık" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Kapalı" }));
    expect(document.documentElement.dataset.motion).toBe("full");
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith({ intent: "motion", motion: "full" }),
    );

    await user.click(screen.getByRole("radio", { name: "Sistem" }));
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith({ intent: "motion", motion: "system" }),
    );
  });

  it("klavyeyle ok tuşlarıyla seçilir", async () => {
    const user = userEvent.setup();
    const onSave = renderPicker("system");
    screen.getByRole("radio", { name: "Sistem" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Açık" })).toBeChecked();
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ intent: "motion", motion: "reduced" }),
    );
  });
});

describe("useReducedMotion", () => {
  it("sistem ayarına uyar; Açık her zaman, Kapalı hiçbir zaman azaltır ve değişince güncellenir", async () => {
    setMedia({ reducedMotion: false });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => setMedia({ reducedMotion: true }));
    expect(result.current).toBe(true);

    act(() => document.documentElement.setAttribute("data-motion", "full"));
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      setMedia({ reducedMotion: false });
      document.documentElement.setAttribute("data-motion", "reduced");
    });
    await waitFor(() => expect(result.current).toBe(true));

    act(() => document.documentElement.removeAttribute("data-motion"));
    await waitFor(() => expect(result.current).toBe(false));
  });
});
