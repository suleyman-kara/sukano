import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gridDataKey,
  noteDataKey,
  revalidateGrid,
  revalidateNote,
  revalidateShell,
  useContentRevalidator,
} from "~/lib/offline-revalidate";

const url = (path: string) => new URL(path, "http://sukano.test");

type Args = Parameters<typeof revalidateShell>[0];
const nav = (from: string, to: string, extra: Partial<Args> = {}): Args => ({
  currentUrl: url(from),
  nextUrl: url(to),
  defaultShouldRevalidate: true,
  ...extra,
});
const post = (from: string, formAction: string, defaultShouldRevalidate = true): Args =>
  nav(from, from, { formMethod: "POST", formAction, defaultShouldRevalidate });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kabuk yeniden doğrulaması (kök loader)", () => {
  it("uygulama içi gezinmede kabuk yeniden yüklenmez", () => {
    expect(revalidateShell(nav("/", "/arsiv"))).toBe(false);
    expect(revalidateShell(nav("/", "/not/a"))).toBe(false);
    expect(revalidateShell(nav("/not/a", "/"))).toBe(false);
    expect(revalidateShell(nav("/proje/p", "/ayarlar"))).toBe(false);
  });

  it("giriş sayfasından uygulamaya geçişte kabuk yüklenir", () => {
    expect(revalidateShell(nav("/giris", "/"))).toBe(true);
    expect(revalidateShell(nav("/", "/giris"))).toBe(true);
  });

  it("not, ek ve hatırlatıcı eylemlerinden sonra kabuk yüklenmez", () => {
    expect(revalidateShell(post("/", "/api/notlar"))).toBe(false);
    expect(revalidateShell(post("/", "/api/notlar.data"))).toBe(false);
    expect(revalidateShell(post("/not/a", "/api/notlar/a/gorevler"))).toBe(false);
    expect(revalidateShell(post("/not/a", "/api/ekler/x"))).toBe(false);
    expect(revalidateShell(post("/not/a", "/api/hatirlaticilar"))).toBe(false);
  });

  it("kabuğu değiştirebilen eylemlerden sonra React Router'ın kararı geçerli", () => {
    expect(revalidateShell(post("/ayarlar", "/ayarlar"))).toBe(true);
    expect(revalidateShell(post("/", "/api/projeler"))).toBe(true);
    expect(revalidateShell(post("/davetler", "/api/davetler", false))).toBe(false);
    expect(revalidateShell(post("/", ""))).toBe(true);
  });

  it("aynı adreste yeniden doğrulamada (revalidate) kabuk yüklenir", () => {
    expect(revalidateShell(nav("/arsiv", "/arsiv"))).toBe(true);
  });

  it("çevrimdışıyken hiçbir rota yeniden yüklenmez", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(revalidateShell(nav("/giris", "/"))).toBe(false);
    expect(revalidateGrid(nav("/", "/", { formMethod: "POST" }))).toBe(false);
    expect(revalidateNote(nav("/not/a", "/not/b"))).toBe(false);
  });
});

describe("ızgara ve açık not yeniden doğrulaması", () => {
  it("ızgaranın anahtarı açık not alt yolunu ve modal parametrelerini atar", () => {
    expect(gridDataKey(url("/not/a"))).toBe("/");
    expect(gridDataKey(url("/arsiv/not/a?surumler"))).toBe("/arsiv");
    expect(gridDataKey(url("/proje/p/not/a?tasi&hatirlatici"))).toBe("/proje/p");
    expect(gridDataKey(url("/ara/not/a?q=market&surumler"))).toBe("/ara?q=market");
  });

  it("kart açıp kapatmak ızgarayı yeniden yüklemez", () => {
    expect(revalidateGrid(nav("/", "/not/a"))).toBe(false);
    expect(revalidateGrid(nav("/not/a", "/"))).toBe(false);
    expect(revalidateGrid(nav("/not/a", "/not/a?surumler"))).toBe(false);
  });

  it("başka proje ya da başka arama ızgarayı yeniden yükler", () => {
    expect(revalidateGrid(nav("/proje/a", "/proje/b"))).toBe(true);
    expect(revalidateGrid(nav("/ara?q=a", "/ara?q=b"))).toBe(true);
  });

  it("eylemden ve revalidate'ten sonra ızgara yüklenir; 4xx eylemde yüklenmez", () => {
    expect(revalidateGrid(post("/", "/api/notlar"))).toBe(true);
    expect(revalidateGrid(post("/", "/api/notlar", false))).toBe(false);
    expect(revalidateGrid(nav("/", "/"))).toBe(true);
  });

  it("açık not yalnızca not değişince yüklenir", () => {
    expect(noteDataKey(url("/not/a?surumler"))).toBe("/not/a");
    expect(revalidateNote(nav("/not/a", "/not/a?surumler"))).toBe(false);
    expect(revalidateNote(nav("/not/a", "/not/b"))).toBe(true);
  });
});

describe("içerik yeniden doğrulaması", () => {
  it("kabuğu yeniden yüklemez; olağan revalidate ise yükler", async () => {
    let loads = 0;
    let api: ReturnType<typeof useContentRevalidator> | null = null;
    function Probe() {
      api = useContentRevalidator();
      return null;
    }
    const router = createMemoryRouter(
      [
        {
          id: "root",
          path: "/",
          loader: () => ++loads,
          shouldRevalidate: revalidateShell,
          Component: Probe,
        },
      ],
      { hydrationData: { loaderData: { root: 0 } } },
    );
    render(createElement(RouterProvider, { router }));
    await act(async () => {
      await api!.revalidate();
    });
    expect(loads).toBe(0);
    expect(api!.state).toBe("idle");
    await act(async () => {
      await router.revalidate();
    });
    expect(loads).toBe(1);
  });
});
