import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("giris", "routes/giris.tsx"),
  route("health", "routes/health.ts"),
  // API rotaları "*" rotasından önce gelmeli.
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
