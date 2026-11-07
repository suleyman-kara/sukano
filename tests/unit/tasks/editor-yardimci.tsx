/**
 * Yapılacaklar editörü bileşen testleri için yardımcılar: sahte sunucu (fetch) ve
 * veri yönlendiricisi içinde çizim.
 */
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { vi } from "vitest";
import type { TodoPeople } from "~/components/tasks/person-picker";
import { applyAssignOps, type AssigneeMap } from "~/components/tasks/task-sync";
import { TodoEditor, type TodoEditorHandle } from "~/components/tasks/todo-editor";
import { treeOrder, type Task } from "~/domain/tasks/model";
import { applyTaskOps, type TaskOp } from "~/domain/tasks/ops";

export type FakeServer = {
  calls: TaskOp[][];
  tasks: () => Task[];
  /** Proje notunda atamalar (`assign` işlemleri uygulanmış). */
  assignees: () => AssigneeMap;
  fetch: ReturnType<typeof vi.fn>;
};

/** `/api/notlar/:id/gorevler`: işlemleri saf `applyTaskOps` ile uygular. */
export function fakeServer(initial: Task[], initialAssignees?: AssigneeMap): FakeServer {
  let server = [...initial];
  let assignees = initialAssignees;
  const calls: TaskOp[][] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const { ops } = JSON.parse(String(init.body)) as { ops: TaskOp[] };
      calls.push(ops);
      try {
        server = applyTaskOps(server, ops, { now: Date.now(), userId: "u" });
      } catch {
        return json({ ok: false, error: "Çakışma" }, 409);
      }
      if (assignees) assignees = applyAssignOps(assignees, ops);
      return json({ ok: true, tasks: treeOrder(server), ...(assignees ? { assignees } : {}) });
    }
    return json({ tasks: treeOrder(server), ...(assignees ? { assignees } : {}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, tasks: () => server, assignees: () => assignees ?? {}, fetch: fetchMock };
}

export function renderEditor(
  tasks: Task[],
  options: {
    noteId?: string;
    ref?: React.Ref<TodoEditorHandle>;
    people?: TodoPeople;
    initialAssignees?: AssigneeMap;
    editable?: boolean;
  } = {},
) {
  const noteId = options.noteId ?? "not-1";
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <TodoEditor
          noteId={noteId}
          initialTasks={tasks}
          ref={options.ref}
          people={options.people}
          initialAssignees={options.initialAssignees}
          editable={options.editable}
        />
      ),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

/** Başlığı verilen görevin başlık alanı. */
export const titleInput = (title: string) =>
  screen
    .getAllByRole("textbox", { name: "Görev başlığı" })
    .find((el) => (el as HTMLInputElement).value === title) as HTMLInputElement;

/** Görünür görev başlıkları, sırayla (girinti seviyesiyle: "  " × derinlik). */
export function visibleTitles(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-task-row]")].map((row) => {
    const input = row.querySelector<HTMLInputElement>("[data-task-input]")!;
    return `${"  ".repeat(Number(row.dataset.depth))}${input.value}`;
  });
}

/** İmleci başlık alanında belirli bir konuma koyar. */
export function caretAt(input: HTMLInputElement, pos: number | "end") {
  input.focus();
  const n = pos === "end" ? input.value.length : pos;
  input.setSelectionRange(n, n);
}
