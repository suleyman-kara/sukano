import { data } from "react-router";
import { NotFoundView } from "~/components/not-found";
import type { Route } from "./+types/not-found";

export function loader() {
  return data(null, { status: 404 });
}

export const meta: Route.MetaFunction = () => [{ title: "Sayfa bulunamadı · Sukano" }];

export default function NotFound() {
  return <NotFoundView />;
}
