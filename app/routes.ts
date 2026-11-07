import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("giris", "routes/giris.tsx"),
  route("health", "routes/health.ts"),
  // Veri katmanı buraya API rotalarını ekleyecek (ör. "api/auth/*").
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
