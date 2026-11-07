import { FileText, ListChecks, Search } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { noteBg } from "~/components/notes/colors";
import { EmptyState, SectionHeading } from "~/components/notes/notes-page";
import { AppShell } from "~/components/shell/app-shell";
import { Button } from "~/components/ui/button";
import { highlight, snippet } from "~/domain/notes/search";
import { getCloudflare } from "~/lib/context";
import { personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/ara";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: d?.q ? `"${d.q}" araması · Sukano` : "Ara · Sukano" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  const results = q ? await personalNotes(getCloudflare(context).env, user.id).search(q) : [];
  return { q, results };
}

function Highlighted({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlight(text, q).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-[var(--mark)] px-0.5 text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Arama sonuçları: Notlarım (projeler Aşama 3'te), eşleşme vurgusu, kaynak etiketi. */
export default function SearchRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const navigate = useNavigate();
  const { q, results } = loaderData;

  return (
    <AppShell {...shell}>
      <section className="flex w-full max-w-[880px] flex-col gap-5 px-4 pt-2 pb-10 md:px-7 md:pt-3 lg:px-8">
        {!q ? (
          <EmptyState
            icon={<Search strokeWidth={1.75} aria-hidden="true" />}
            title="Notlarında ara"
          >
            Başlık, metin ve görev başlıklarında arar. Yukarıdaki arama alanına yaz.
          </EmptyState>
        ) : results.length === 0 ? (
          <>
            <h1 className="sr-only">Arama sonuçları</h1>
            <EmptyState
              icon={<Search strokeWidth={1.75} aria-hidden="true" />}
              title={`"${q}" için sonuç yok`}
              actions={
                <Button variant="outline" onClick={() => navigate("/ara")}>
                  Aramayı temizle
                </Button>
              }
            >
              Notlarında başlık, metin ve görev başlıklarına bakıldı. Daha kısa bir sözcük dene.
            </EmptyState>
          </>
        ) : (
          <>
            <h1 className="m-0 text-xl font-semibold">
              &ldquo;{q}&rdquo; için {results.length} sonuç
            </h1>
            <nav aria-label="Kaynak süzgeci" className="flex gap-2 overflow-x-auto pb-0.5">
              <span
                aria-current="true"
                className="inline-flex h-8 shrink-0 items-center rounded-full border border-fg bg-fg px-3 font-medium text-bg"
              >
                Tümü
              </span>
              <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-line bg-surface px-3 font-medium">
                Notlarım
              </span>
            </nav>
            <div>
              <SectionHeading>Notlarım</SectionHeading>
              <ul
                className="m-0 flex list-none flex-col gap-2.5 p-0"
                aria-label="Notlarım sonuçları"
              >
                {results.map((r) => {
                  const Icon = r.kind === "todo" ? ListChecks : FileText;
                  const text = snippet(r.text, q, 70);
                  return (
                    <li key={r.id}>
                      <Link
                        to={r.archived ? `/arsiv/not/${r.id}` : `/not/${r.id}`}
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
                        </span>
                        <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground max-sm:hidden">
                          Notlarım
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
