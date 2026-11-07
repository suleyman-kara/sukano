import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
  // Notlarım: ızgara + açık not modalı (/not/:id ızgaranın üstünde açılır).
  route("", "routes/home.tsx", [route("not/:id", "routes/not.tsx")]),
  route("arsiv", "routes/arsiv.tsx", [route("not/:id", "routes/not.tsx", { id: "arsiv-not" })]),
  route("cop", "routes/cop.tsx"),
  route("ara", "routes/ara.tsx"),
  route("api/notlar", "routes/api.notlar.ts"),
  route("api/notlar/:id/surumler", "routes/api.notlar.surumler.ts"),
  route("giris", "routes/giris.tsx"),
  route("health", "routes/health.ts"),
  // API rotaları "*" rotasından önce gelmeli.
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
