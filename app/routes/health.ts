/** Sağlık denetimi: GET /health → { ok: true } */
export function loader() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
