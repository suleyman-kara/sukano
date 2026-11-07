import { FileText, ListChecks, Search } from "lucide-react";
import { Link, Outlet, useNavigate } from "react-router";
import { cn } from "cn";
import { noteBg } from "~/components/notes/colors";
import { EmptyState, SectionHeading } from "~/components/notes/notes-page";
import { AppShell } from "~/components/shell/app-shell";
import { Button } from "~/components/ui/button";
import type { ProjectColor } from "~/db/schema";
import { highlight, snippet } from "~/domain/notes/search";
import { getCloudflare } from "~/lib/context";
import { searchAccessible, type SearchResult, type SearchSource } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/ara";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: d?.q ? `"${d.q}" araması · Sukano` : "Ara · Sukano" },
];

/** Kaynak süzgeci: `?kaynak=notlarim` ya da proje kimliği; yoksa tümü. */
const PERSONAL_SOURCE = "notlarim";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const source = url.searchParams.get("kaynak") ?? "";
  const results = q ? await searchAccessible(getCloudflare(context).env, user.id, q) : [];
  return { q, source, results };
}

const sourceKey = (s: SearchSource) => (s.kind === "personal" ? PERSONAL_SOURCE : s.projectId);
const sourceName = (s: SearchSource) => (s.kind === "personal" ? "Notlarım" : s.name);

function Highlighted({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlight(text, q).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-[var(--mark)] px-0.5 text-fg">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Dot({ color }: { color: ProjectColor }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: `var(--p-${color})` }}
      aria-hidden="true"
    />
  );
}

/** Kaynağa göre gruplar (Notlarım önce, sonra projeler ilk sonuç sırasıyla). */
function groupBySource(results: readonly SearchResult[]) {
  const groups = new Map<string, { source: SearchSource; items: SearchResult[] }>();
  const personal = results.filter((r) => r.source.kind === "personal");
  if (personal.length)
    groups.set(PERSONAL_SOURCE, { source: personal[0]!.source, items: personal });
  for (const r of results) {
    if (r.source.kind === "personal") continue;
    const key = sourceKey(r.source);
    const g = groups.get(key) ?? { source: r.source, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }
  return [...groups.entries()];
}

/**
 * Birleşik arama (PLAN §3): Notlarım ve erişilen tüm projeler tek listede; kaynak
 * süzgeci, kaynağa göre bölümler, eşleşme vurgusu ve kaynak etiketi (proje rengi ve
 * adı). Sonuç, aramanın üstünde açılır (`/ara/not/:id?q=…`); kapanınca sonuçlara döner.
 */
export default function SearchRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const navigate = useNavigate();
  const { q, source, results } = loaderData;
  const filtered = source ? results.filter((r) => sourceKey(r.source) === source) : results;
  const groups = groupBySource(filtered);
  const params = (kaynak?: string) => {
    const p = new URLSearchParams({ q });
    if (kaynak) p.set("kaynak", kaynak);
    return `?${p.toString()}`;
  };
  const chips: { key: string; label: string; color?: ProjectColor }[] = [
    { key: "", label: "Tümü" },
    { key: PERSONAL_SOURCE, label: "Notlarım" },
    ...shell.projects.map((p) => ({ key: p.id, label: p.name, color: p.color })),
  ];
  const projectCount = shell.projects.length;
  const where =
    projectCount > 0
      ? `Notlarında ve erişebildiğin ${projectCount} projede başlık, metin ve görev başlıklarına bakıldı.`
      : "Notlarında başlık, metin ve görev başlıklarına bakıldı.";

  return (
    <AppShell {...shell}>
      <section className="flex w-full max-w-[880px] flex-col gap-5 px-4 pt-2 pb-10 md:px-7 md:pt-3 lg:px-8">
        {!q ? (
          <EmptyState
            icon={<Search strokeWidth={1.75} aria-hidden="true" />}
            title="Notlarında ve projelerinde ara"
          >
            Başlık, metin ve görev başlıklarında arar. Yukarıdaki arama alanına yaz.
          </EmptyState>
        ) : (
          <>
            {filtered.length === 0 ? (
              <h1 className="sr-only">Arama sonuçları</h1>
            ) : (
              <h1 className="m-0 text-xl font-semibold">
                &ldquo;{q}&rdquo; için {filtered.length} sonuç
              </h1>
            )}
            <nav aria-label="Kaynak süzgeci" className="flex gap-2 overflow-x-auto pb-0.5">
              {chips.map((c) => {
                const on = c.key === source;
                return (
                  <Link
                    key={c.key || "tumu"}
                    to={params(c.key || undefined)}
                    replace
                    preventScrollReset
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 font-medium whitespace-nowrap text-fg no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on ? "border-fg bg-fg text-bg" : "border-line bg-surface hover:bg-hover",
                    )}
                  >
                    {c.color && <Dot color={c.color} />}
                    {c.label}
                  </Link>
                );
              })}
            </nav>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Search strokeWidth={1.75} aria-hidden="true" />}
                title={`"${q}" için sonuç yok`}
                actions={
                  <Button variant="outline" onClick={() => navigate("/ara")}>
                    Aramayı temizle
                  </Button>
                }
              >
                {where} Daha kısa bir sözcük dene.
              </EmptyState>
            ) : (
              groups.map(([key, g]) => (
                <div key={key}>
                  <SectionHeading>{sourceName(g.source)}</SectionHeading>
                  <ul
                    className="m-0 flex list-none flex-col gap-2.5 p-0"
                    aria-label={`${sourceName(g.source)} sonuçları`}
                  >
                    {g.items.map((r) => (
                      <ResultItem key={r.id} r={r} q={q} search={params(source || undefined)} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </section>
      <Outlet />
    </AppShell>
  );
}

function ResultItem({ r, q, search }: { r: SearchResult; q: string; search: string }) {
  const Icon = r.kind === "todo" ? ListChecks : FileText;
  const text = snippet(r.text, q, 70);
  return (
    <li>
      <Link
        to={`/ara/not/${encodeURIComponent(r.id)}${search}`}
        preventScrollReset
        className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-fg no-underline outline-none hover:shadow-elevated focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-muted-foreground"
          style={{ background: noteBg(r.color) }}
          aria-hidden="true"
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <h3 className="m-0 mb-0.5 text-[15px] font-semibold break-words">
            {r.title ? <Highlighted text={r.title} q={q} /> : "Başlıksız not"}
          </h3>
          {text && (
            <p className="m-0 break-words text-muted-foreground">
              {r.inTask && "Görev: "}
              <Highlighted text={text} q={q} />
              {r.archived && (
                <span className="ml-1 inline-block rounded-full bg-hover px-2 py-px text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                  Arşivde
                </span>
              )}
            </p>
          )}
          {/* Mobilde kaynak etiketi alt satırda (MSearch). */}
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
            {r.source.kind === "project" && <Dot color={r.source.color} />}
            {sourceName(r.source)}
          </span>
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-xs whitespace-nowrap text-muted-foreground max-sm:hidden"
          data-testid="kaynak"
        >
          {r.source.kind === "project" && <Dot color={r.source.color} />}
          {sourceName(r.source)}
        </span>
      </Link>
    </li>
  );
}
