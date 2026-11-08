import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteAccessInfo } from "~/components/notes/note-access";
import { NoteCard } from "~/components/notes/note-card";
import { NoteDialog } from "~/components/notes/note-dialog";
import type { NoteActions } from "~/components/notes/use-note-actions";
import type { NoteCardData } from "~/domain/notes/optimistic";
import type { AttachmentInfo } from "~/lib/attachment-store.server";
import type { NoteDetail } from "~/lib/notes.server";
import { setMedia } from "../../helpers/media";

/**
 * Açık metin notunda ekler (TextNote, TText, MText, States2 "Dosya eki · yükleniyor ve
 * sınır"): küçük resim ve dosya çipi, yükleme ilerlemesi, hata metinleri, görüntüleyicide
 * salt okunur liste, görsel görüntüleyici.
 */

const MB = 1024 * 1024;

const IMAGE: AttachmentInfo = {
  id: "ek-gorsel",
  name: "salon.jpg",
  size: 2.4 * MB,
  contentType: "image/jpeg",
  kind: "image",
  createdAt: "2026-11-07T10:00:00.000Z",
};
const PDF: AttachmentInfo = {
  id: "ek-pdf",
  name: "usta-teklifi-kasim.pdf",
  size: 1.8 * MB,
  contentType: "application/pdf",
  kind: "file",
  createdAt: "2026-11-07T10:01:00.000Z",
};

function textNote(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: "ev-tadilati",
    kind: "text",
    title: "Ev tadilatı fikirleri",
    color: "turuncu",
    pinned: false,
    bodyHtml: "<p>Salon</p>",
    tasks: [],
    todoTasks: [],
    attachmentCount: 2,
    attachments: [IMAGE, PDF],
    projectId: null,
    createdBy: null,
    updatedBy: null,
    assignees: {},
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-07T10:00:00.000Z",
    archivedAt: null,
    trashedAt: null,
    ...over,
  };
}

/** Sahte XMLHttpRequest: testte ilerleme, yanıt ve ağ hatası elle tetiklenir. */
class FakeXhr {
  static all: FakeXhr[] = [];
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  response: unknown = null;
  responseType = "";
  method = "";
  url = "";
  body: FormData | null = null;
  constructor() {
    FakeXhr.all.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  progress(loaded: number) {
    act(() => this.upload.onprogress?.({ loaded }));
  }
  async respond(status: number, response: unknown) {
    this.status = status;
    this.response = response;
    await act(async () => this.onload?.());
  }
  async fail() {
    await act(async () => this.onerror?.());
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeXhr.all = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(note: NoteDetail = textNote(), access?: NoteAccessInfo) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <NoteDialog note={note} access={access} closeTo="/x" /> },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return screen.getByRole("dialog", { name: note.title });
}

function file(name: string, size: number, type = "") {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

async function pick(dialog: HTMLElement, ...files: File[]) {
  const input = within(dialog).getByTestId("dosya-sec") as HTMLInputElement;
  await userEvent.setup({ applyAccept: false }).upload(input, files);
}

describe("ek listesi", () => {
  it("görsel küçük resim, dosya rozet + ad + Türkçe boyutla görünür; dosya indirilir", () => {
    const dialog = open();
    const list = within(dialog).getByRole("region", { name: "Ekler" });
    expect(within(list).getByRole("button", { name: "Görseli aç: salon.jpg" })).toBeVisible();
    const link = within(list).getByRole("link", { name: "İndir: usta-teklifi-kasim.pdf 1,8 MB" });
    expect(link).toHaveAttribute("href", "/api/ekler/ek-pdf?indir=1");
    expect(link).toHaveAttribute("download", "usta-teklifi-kasim.pdf");
    expect(list).toHaveTextContent("PDF");
  });

  it("görsele tıklayınca görüntüleyici açılır; İndir bağlantısı ve Kapat vardır", async () => {
    const user = userEvent.setup();
    const dialog = open();
    await user.click(within(dialog).getByRole("button", { name: "Görseli aç: salon.jpg" }));
    const viewer = screen.getByRole("dialog", { name: "salon.jpg" });
    expect(within(viewer).getByRole("img", { name: "salon.jpg" })).toHaveAttribute(
      "src",
      "/api/ekler/ek-gorsel",
    );
    expect(within(viewer).getByRole("link", { name: "İndir" })).toHaveAttribute(
      "href",
      "/api/ekler/ek-gorsel?indir=1",
    );
    expect(viewer).toHaveTextContent("2,4 MB");
    await user.click(within(viewer).getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog", { name: "salon.jpg" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Ev tadilatı fikirleri" })).toBeInTheDocument();
  });

  it("birden çok görselde oklarla gezinilir", async () => {
    const user = userEvent.setup();
    const second = { ...IMAGE, id: "ek-2", name: "balkon.png" };
    const dialog = open(textNote({ attachments: [IMAGE, second] }));
    await user.click(within(dialog).getByRole("button", { name: "Görseli aç: salon.jpg" }));
    expect(screen.getByRole("dialog", { name: "salon.jpg" })).toHaveTextContent("1 / 2");
    await user.click(screen.getByRole("button", { name: "Sonraki görsel" }));
    expect(screen.getByRole("dialog", { name: "balkon.png" })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: "salon.jpg" })).toBeInTheDocument();
  });

  it("eki kaldır: istek gider, ek listeden kalkar", async () => {
    const user = userEvent.setup();
    const dialog = open();
    await user.click(
      within(dialog).getByRole("button", { name: "Eki kaldır: usta-teklifi-kasim.pdf" }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/ekler/ek-pdf", { method: "DELETE" });
    expect(within(dialog).queryByText("usta-teklifi-kasim.pdf")).not.toBeInTheDocument();
  });

  it("kaldırma başarısız olursa ek geri gelir", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "Bu işlem için yetkin yok" }), {
        status: 403,
      }),
    );
    const user = userEvent.setup();
    const dialog = open();
    await user.click(
      within(dialog).getByRole("button", { name: "Eki kaldır: usta-teklifi-kasim.pdf" }),
    );
    expect(await within(dialog).findByText("usta-teklifi-kasim.pdf")).toBeInTheDocument();
  });

  it("eki yoksa liste çizilmez", () => {
    const dialog = open(textNote({ attachments: [], attachmentCount: 0 }));
    expect(within(dialog).queryByRole("region", { name: "Ekler" })).not.toBeInTheDocument();
  });
});

describe("yükleme durumları", () => {
  it("seçilen dosya ilerlemeyle yüklenir, bitince dosya çipine döner", async () => {
    const dialog = open(textNote({ attachments: [] }));
    await pick(dialog, file("salon-olcu.jpg", 3.1 * MB, "image/jpeg"));
    const xhr = FakeXhr.all[0]!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/notlar/ev-tadilati/ekler");
    expect((xhr.body?.get("dosya") as File).name).toBe("salon-olcu.jpg");
    xhr.progress(2.4 * MB);
    const bar = within(dialog).getByRole("progressbar", { name: "salon-olcu.jpg yükleniyor" });
    expect(bar).toHaveAttribute("aria-valuenow", "77");
    expect(dialog).toHaveTextContent("2,4 / 3,1 MB");
    await xhr.respond(201, {
      ok: true,
      attachment: { ...PDF, id: "yeni", name: "tablo.pdf", size: 3.1 * MB },
    });
    expect(within(dialog).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "İndir: tablo.pdf 3,1 MB" })).toBeVisible();
  });

  it("10 MB'yi aşan dosya gönderilmez; tasarımdaki metin ve Kaldır görünür", async () => {
    const user = userEvent.setup();
    const dialog = open(textNote({ attachments: [] }));
    await pick(dialog, file("balkon-video.mov", 48 * MB));
    expect(FakeXhr.all).toHaveLength(0);
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("balkon-video.mov");
    expect(alert).toHaveTextContent("48 MB · dosya başına en fazla 10 MB");
    expect(within(alert).queryByRole("button", { name: "Tekrar dene" })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Kaldır" }));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("izin verilmeyen tür reddedilir", async () => {
    const dialog = open(textNote({ attachments: [] }));
    await pick(dialog, file("kur.exe", 100));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Bu dosya türü eklenemez");
    expect(FakeXhr.all).toHaveLength(0);
  });

  it("ağ hatasında Tekrar dene yeniden yükler", async () => {
    const user = userEvent.setup();
    const dialog = open(textNote({ attachments: [] }));
    await pick(dialog, file("not.txt", 100));
    await FakeXhr.all[0]!.fail();
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("Yüklenemedi · bağlantını denetleyip tekrar dene");
    await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
    expect(FakeXhr.all).toHaveLength(2);
    expect(within(dialog).getByRole("progressbar")).toBeInTheDocument();
  });

  it("sunucunun reddi metniyle gösterilir", async () => {
    const dialog = open(textNote({ attachments: [] }));
    await pick(dialog, file("a.png", 100));
    await FakeXhr.all[0]!.respond(409, {
      ok: false,
      error: "Bir nota en fazla 20 dosya eklenebilir",
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Bir nota en fazla 20 dosya eklenebilir",
    );
  });

  it("dosya nota sürüklenip bırakılınca yüklenir; sürüklerken bırakma alanı görünür", () => {
    const dialog = open(textNote({ attachments: [] }));
    const f = file("plan.pdf", 2000);
    const dataTransfer = { types: ["Files"], files: [f], dropEffect: "" };
    fireEvent.dragOver(dialog, { dataTransfer });
    expect(dialog).toHaveTextContent("Dosyayı buraya bırak ya da seç · yalnızca metin notunda");
    fireEvent.drop(dialog, { dataTransfer });
    expect(dialog).not.toHaveTextContent("Dosyayı buraya bırak");
    expect(FakeXhr.all).toHaveLength(1);
  });

  it("panodan yapıştırılan görsel yüklenir", () => {
    const dialog = open(textNote({ attachments: [] }));
    const f = file("image.png", 500, "image/png");
    fireEvent.paste(within(dialog).getByLabelText("Not başlığı"), {
      clipboardData: { files: [f], getData: () => "" },
    });
    expect(FakeXhr.all).toHaveLength(1);
  });

  it("mobilde Dosya ekle alt çubuktadır ve ekler tam genişlikte alt alta dizilir", () => {
    setMedia({ width: 390 });
    const dialog = open();
    expect(within(dialog).getByRole("button", { name: "Dosya ekle" })).toBeEnabled();
    expect(within(dialog).getByRole("region", { name: "Ekler" })).toHaveClass("flex-col");
  });
});

describe("salt okunur", () => {
  const viewer: NoteAccessInfo = {
    kind: "project",
    project: { id: "p", name: "Proje", color: "mavi" },
    role: "goruntuleyici",
    members: [],
  };

  it("görüntüleyici ekleri görür ve indirir ama ekleyemez, kaldıramaz, bırakamaz", () => {
    const dialog = open(textNote({ projectId: "p" }), viewer);
    expect(within(dialog).queryByRole("button", { name: "Dosya ekle" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Eki kaldır/ })).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /İndir: usta-teklifi-kasim.pdf/ }),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Görseli aç: salon.jpg" })).toBeVisible();
    fireEvent.drop(dialog, { dataTransfer: { types: ["Files"], files: [file("a.png", 5)] } });
    expect(FakeXhr.all).toHaveLength(0);
  });

  it("yapılacaklar notunda ek düğmesi ve listesi yok", () => {
    const dialog = open(
      textNote({ kind: "todo", attachments: [], attachmentCount: 0, bodyHtml: "" }),
    );
    expect(within(dialog).queryByRole("button", { name: "Dosya ekle" })).not.toBeInTheDocument();
    fireEvent.drop(dialog, { dataTransfer: { types: ["Files"], files: [file("a.png", 5)] } });
    expect(FakeXhr.all).toHaveLength(0);
  });
});

describe("ızgara kartı", () => {
  const card = (extra: Partial<NoteCardData>): NoteCardData => ({
    id: "n1",
    kind: "text",
    title: "Yürüyüş rotaları",
    color: "mavi",
    pinned: false,
    position: 0,
    preview: "Belgrad Ormanı uzun parkur.",
    tasks: [],
    moreTasks: 0,
    updatedAt: "2026-11-05T11:20:00.000Z",
    archivedAt: null,
    trashedAt: null,
    ...extra,
  });
  const actions = {} as NoteActions;
  function show(note: NoteCardData) {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <NoteCard
            note={note}
            view="notlar"
            href="/not/n1"
            actions={actions}
            onVersions={vi.fn()}
          />
        ),
      },
    ]);
    return render(<Stub initialEntries={["/"]} />).container;
  }

  it("görsel ekli kartın üstünde kapak görseli vardır", () => {
    const el = show(card({ cover: { id: "ek-1", name: "rota.jpg" }, attachmentCount: 2 }));
    expect(el.querySelector("img[data-kapak]")).toHaveAttribute("src", "/api/ekler/ek-1");
    expect(el.querySelector("[data-ek-sayisi]")).toBeNull();
  });

  it("yalnızca dosya ekli kartta ataç ve ek sayısı görünür", () => {
    show(card({ cover: null, attachmentCount: 3 }));
    expect(screen.getByText("3 ek")).toBeInTheDocument();
  });
});
