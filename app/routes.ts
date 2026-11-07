import { type RouteConfig, layout, route } from "@react-router/dev/routes";

/*
 * Oturum koruması `app/root.tsx` middleware'indedir ve varsayılan kapalıdır: aşağıda
 * kimlik sayfaları, /cikis, /health, /api/auth/* ve /__test/* dışındaki her rota
 * oturum ister (bkz. `app/domain/auth/redirects.ts` → `isPublicPath`).
 */
export default [
  // Notlarım: ızgara + açık not modalı (/not/:id ızgaranın üstünde açılır).
  route("", "routes/home.tsx", [route("not/:id", "routes/not.tsx")]),
  route("arsiv", "routes/arsiv.tsx", [route("not/:id", "routes/not.tsx", { id: "arsiv-not" })]),
  route("cop", "routes/cop.tsx"),
  route("ara", "routes/ara.tsx"),
  // Proje alanı: Notlar · Arşiv · Çöp (açık not alt rotada) ve ayarlar.
  route("proje/:projeId", "routes/proje.tsx", [
    route("not/:id", "routes/not.tsx", { id: "proje-not" }),
  ]),
  route("proje/:projeId/arsiv", "routes/proje.tsx", { id: "proje-arsiv" }, [
    route("not/:id", "routes/not.tsx", { id: "proje-arsiv-not" }),
  ]),
  route("proje/:projeId/cop", "routes/proje.tsx", { id: "proje-cop" }),
  route("proje/:projeId/ayarlar", "routes/proje.ayarlar.tsx"),
  route("davetler", "routes/davetler.tsx"),
  route("silinmis-projeler", "routes/silinmis-projeler.tsx"),
  route("api/notlar", "routes/api.notlar.ts"),
  route("api/notlar/:id/surumler", "routes/api.notlar.surumler.ts"),
  route("api/notlar/:id/gorevler", "routes/api.notlar.gorevler.ts"),
  route("api/projeler", "routes/api.projeler.ts"),
  route("api/projeler/:id", "routes/api.projeler.proje.ts"),
  route("api/projeler/:id/uyeler", "routes/api.projeler.uyeler.ts"),
  route("api/davetler", "routes/api.davetler.ts"),
  route("ayarlar", "routes/ayarlar.tsx"),
  // Kimlik sayfaları: kabuksuz düzen, oturum varsa `/`'a yönlendirir.
  layout("routes/_kimlik.tsx", [
    route("giris", "routes/giris.tsx"),
    route("kayit", "routes/kayit.tsx"),
    route("dogrula", "routes/dogrula.tsx"),
    route("sifremi-unuttum", "routes/sifremi-unuttum.tsx"),
    route("sifre-sifirla", "routes/sifre-sifirla.tsx"),
  ]),
  route("dogrula/:token", "routes/dogrula.$token.tsx"),
  route("cikis", "routes/cikis.ts"),
  route("__test/outbox", "routes/__test.outbox.ts"),
  route("health", "routes/health.ts"),
  // API rotaları "*" rotasından önce gelmeli.
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
