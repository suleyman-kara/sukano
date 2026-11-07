/**
 * Notun açıldığı adres. Kişisel not ızgaranın üstünde (`/not/:id`, arşivde
 * `/arsiv/not/:id`), proje notu proje sayfasının üstünde açılır
 * (`/proje/:projeId/not/:id`, arşivde `/proje/:projeId/arsiv/not/:id`).
 */
export function noteHref(note: {
  id: string;
  projectId: string | null;
  archived?: boolean;
}): string {
  const id = encodeURIComponent(note.id);
  if (!note.projectId) return note.archived ? `/arsiv/not/${id}` : `/not/${id}`;
  const base = `/proje/${encodeURIComponent(note.projectId)}`;
  return note.archived ? `${base}/arsiv/not/${id}` : `${base}/not/${id}`;
}

/**
 * Açık not kapanınca dönülecek adres: yoldaki son `/not/:id` atılır, sorgu korunur
 * (`/not/x` → `/`, `/proje/p/arsiv/not/x` → `/proje/p/arsiv`, `/ara/not/x?q=a` → `/ara?q=a`).
 */
export function closeHref(pathname: string, search = ""): string {
  const base = pathname.replace(/\/not\/[^/]+\/?$/, "") || "/";
  const params = new URLSearchParams(search);
  params.delete("surumler");
  params.delete("tasi");
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}
