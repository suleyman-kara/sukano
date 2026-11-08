import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub, useLocation } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { InviteForm, inviteErrorTone } from "~/components/projects/invite-form";
import { MembersList, type MemberRow } from "~/components/projects/members-list";
import { NewProjectDialog } from "~/components/projects/new-project-dialog";
import { LeaveProjectDialog } from "~/components/projects/project-dialogs";
import { DeleteAccountDialog } from "~/components/settings/delete-account-dialog";
import { SidebarNav } from "~/components/shell/sidebar";
import { MESSAGES } from "~/domain/projects/permissions";

type Reply = Record<string, unknown>;

/**
 * Bileşeni veri yönlendiricisinde çizer; `/api/...` eylemleri gönderilen formu
 * kaydeder ve verilen yanıtı döner.
 */
function setup(
  ui: React.ReactNode,
  reply: (form: Record<string, string>) => Reply = () => ({ ok: true }),
) {
  const calls: { path: string; form: Record<string, string> }[] = [];
  const action =
    (path: string) =>
    async ({ request }: { request: Request }) => {
      const form = Object.fromEntries(await request.formData()) as Record<string, string>;
      calls.push({ path, form });
      return reply(form);
    };
  function Where() {
    const loc = useLocation();
    return <p data-testid="konum">{loc.pathname}</p>;
  }
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          {ui}
          <Toaster />
        </>
      ),
    },
    { path: "/proje/:id", Component: Where },
    { path: "/api/projeler", action: action("/api/projeler") },
    { path: "/api/projeler/:id", action: action("/api/projeler/:id") },
    { path: "/ayarlar", action: action("/ayarlar") },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return { calls, user: userEvent.setup() };
}

const members: MemberRow[] = [
  {
    userId: "suleyman",
    name: "Süleyman Kara",
    email: "suleyman@test.sukano",
    avatarColor: "#3F6E5A",
    avatarUrl: null,
    role: "yonetici",
    isMe: true,
  },
  {
    userId: "can",
    name: "Can Yılmaz",
    email: "can@test.sukano",
    avatarColor: "#4F6C7A",
    avatarUrl: null,
    role: "duzenleyici",
    isMe: false,
  },
];

describe("proje ayarları: üye listesi", () => {
  it("yönetici rolü seçince set-role eylemi kişi ve yeni rolle gönderilir", async () => {
    const { calls, user } = setup(
      <MembersList projectId="web" members={members} canManage onLeave={vi.fn()} />,
    );
    await user.selectOptions(screen.getByLabelText("Can Yılmaz rolü"), "goruntuleyici");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/projeler/:id",
      form: { intent: "set-role", userId: "can", role: "goruntuleyici" },
    });
  });

  it("son yönetici kuralı ihlal edilince sunucu metni toast olur ve seçici eski role döner", async () => {
    const { user } = setup(
      <MembersList projectId="web" members={members} canManage onLeave={vi.fn()} />,
      () => ({ ok: false, error: MESSAGES.sonYoneticiIndirme, code: "son_yonetici" }),
    );
    const select = screen.getByLabelText("Süleyman Kara rolü");
    await user.selectOptions(select, "duzenleyici");
    expect(await screen.findByText(MESSAGES.sonYoneticiIndirme)).toBeInTheDocument();
    expect(select).toHaveValue("yonetici");
  });

  it("çıkarma onay ister; Vazgeç hiçbir şey göndermez, onaylayınca remove-member gider", async () => {
    const { calls, user } = setup(
      <MembersList projectId="web" members={members} canManage onLeave={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Can Yılmaz: projeden çıkar" }));
    let dialog = await screen.findByRole("alertdialog", { name: "Üye projeden çıkarılsın mı?" });
    expect(within(dialog).getByText("can@test.sukano · Düzenleyici")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Can Yılmaz: projeden çıkar" }));
    dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Projeden çıkar" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.form).toEqual({ intent: "remove-member", userId: "can" });
  });

  it("yönetici olmayan rolleri metin olarak görür, seçici ve çıkarma düğmesi yoktur", () => {
    setup(<MembersList projectId="web" members={members} canManage={false} onLeave={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /projeden çıkar/ })).not.toBeInTheDocument();
    expect(screen.getByText("Düzenleyici")).toBeInTheDocument();
  });

  it("kendi satırındaki Ayrıl ayrılma diyaloğunu ister", async () => {
    const onLeave = vi.fn();
    const { user } = setup(
      <MembersList projectId="web" members={members} canManage onLeave={onLeave} />,
    );
    await user.click(screen.getByRole("button", { name: "Ayrıl" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});

describe("davet formu", () => {
  it("hata türleri doğru gösterime eşlenir", () => {
    expect(inviteErrorTone("hesap_yok")).toBe("field");
    expect(inviteErrorTone("gecersiz_eposta")).toBe("field");
    expect(inviteErrorTone("dogrulanmamis")).toBe("warn");
    expect(inviteErrorTone("zaten_uye")).toBe("info");
    expect(inviteErrorTone("bekleyen_davet")).toBe("info");
    expect(inviteErrorTone(undefined)).toBe("field");
  });

  const cases = [
    { code: "hesap_yok", error: MESSAGES.hesapYok, invalid: true },
    { code: "gecersiz_eposta", error: MESSAGES.gecersizEposta, invalid: true },
    {
      code: "dogrulanmamis",
      error: "Emre henüz e-postasını doğrulamadı. Doğrulayınca davet edilebilir.",
      invalid: false,
    },
    { code: "zaten_uye", error: "Mehmet Kaya zaten bu projenin üyesi.", invalid: false },
    {
      code: "bekleyen_davet",
      error: "Mehmet Kaya için bekleyen bir davet zaten var.",
      invalid: false,
    },
  ] as const;

  for (const c of cases) {
    it(`${c.code} hatasında sunucu metni ${c.invalid ? "alanın altında, alan geçersiz" : "bilgi kutusunda, alan geçerli"} görünür`, async () => {
      const { calls, user } = setup(<InviteForm projectId="web" />, () => ({
        ok: false,
        error: c.error,
        code: c.code,
      }));
      const input = screen.getByLabelText("E-posta");
      await user.type(input, "kisi@ornek.com");
      await user.selectOptions(screen.getByLabelText("Rol"), "goruntuleyici");
      await user.click(screen.getByRole("button", { name: "Davet gönder" }));
      expect(await screen.findByText(c.error)).toBeInTheDocument();
      expect(calls[0]!.form).toEqual({
        intent: "invite",
        email: "kisi@ornek.com",
        role: "goruntuleyici",
      });
      if (c.invalid) expect(input).toHaveAttribute("aria-invalid", "true");
      else expect(input).not.toHaveAttribute("aria-invalid");
      expect(input).toHaveAccessibleDescription(c.error);

      await user.type(input, "x");
      expect(screen.queryByText(c.error)).not.toBeInTheDocument();
    });
  }

  it("davet gidince alan temizlenir ve onay toast'ı görünür", async () => {
    const onSent = vi.fn();
    const { user } = setup(<InviteForm projectId="web" onSent={onSent} />, () => ({
      ok: true,
      invitationId: "d1",
    }));
    const input = screen.getByLabelText("E-posta");
    expect(screen.getByRole("button", { name: "Davet gönder" })).toBeDisabled();
    await user.type(input, "deniz@ornek.com");
    await user.click(screen.getByRole("button", { name: "Davet gönder" }));
    expect(await screen.findByText("Davet gönderildi · deniz@ornek.com")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(onSent).toHaveBeenCalledWith("deniz@ornek.com");
  });
});

describe("yeni proje diyaloğu", () => {
  it("ad boşken göndermez ve 'Proje adı gerekli' der", async () => {
    const { calls, user } = setup(<NewProjectDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Projeyi oluştur" }));
    expect(screen.getByText("Proje adı gerekli")).toBeInTheDocument();
    expect(screen.getByLabelText("Proje adı")).toHaveAttribute("aria-invalid", "true");
    expect(calls).toHaveLength(0);
  });

  it("ad, renk ve açıklamayla oluşturur, sonra yeni projenin sayfasına gider", async () => {
    const onOpenChange = vi.fn();
    const { calls, user } = setup(<NewProjectDialog open onOpenChange={onOpenChange} />, () => ({
      ok: true,
    }));
    const dialog = screen.getByRole("dialog", { name: "Yeni proje" });
    await user.type(within(dialog).getByLabelText("Proje adı"), "Kış Tatili Planı");
    await user.click(within(dialog).getByRole("radio", { name: "Mor" }));
    await user.type(within(dialog).getByLabelText(/Açıklama/), "Ocakta Kars");
    await user.click(within(dialog).getByRole("button", { name: "Projeyi oluştur" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    const form = calls[0]!.form;
    expect(form).toMatchObject({
      intent: "create",
      name: "Kış Tatili Planı",
      color: "mor",
      description: "Ocakta Kars",
    });
    expect(form.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByTestId("konum")).toHaveTextContent(`/proje/${form.id}`);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Vazgeç diyaloğu kapatır", async () => {
    const onOpenChange = vi.fn();
    const { user } = setup(<NewProjectDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("hesap silme diyaloğu", () => {
  it("e-posta adresi aynen yazılana kadar silme düğmesi kapalıdır (büyük/küçük harf fark etmez)", async () => {
    const { calls, user } = setup(
      <DeleteAccountDialog email="suleyman@test.sukano" blockers={[]} />,
      () => ({ intent: "delete-account", ok: true }),
    );
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    const dialog = await screen.findByRole("dialog", { name: "Hesabın silinsin mi?" });
    const confirm = within(dialog).getByRole("button", { name: "Hesabımı sil" });
    const input = within(dialog).getByLabelText("Onaylamak için e-posta adresini yaz");
    expect(confirm).toBeDisabled();
    await user.type(input, "suleyman@test");
    expect(confirm).toBeDisabled();
    await user.type(input, ".SUKANO");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/ayarlar",
      form: { intent: "delete-account", email: "suleyman@test.SUKANO" },
    });
  });

  it("sunucu e-postanın eşleşmediğini söylerse hata alanın altında görünür", async () => {
    const { user } = setup(<DeleteAccountDialog email="a@b.co" blockers={[]} />, () => ({
      intent: "delete-account",
      ok: false,
      errors: { email: MESSAGES.epostaUyusmuyor },
    }));
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "a@b.co");
    await user.click(within(dialog).getByRole("button", { name: "Hesabımı sil" }));
    expect(await within(dialog).findByText(MESSAGES.epostaUyusmuyor)).toBeInTheDocument();
  });

  it("tek yönetici olunan proje varsa projeler bağlantılarıyla listelenir ve silme kapalıdır", async () => {
    const { user } = setup(
      <DeleteAccountDialog
        email="suleyman@test.sukano"
        blockers={[
          { id: "ev-tasinma", name: "Ev Taşınma" },
          { id: "kitap-kulubu", name: "Kitap Kulübü" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Hesabımı sil" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Ev Taşınma" })).toHaveAttribute(
      "href",
      "/proje/ev-tasinma/ayarlar",
    );
    expect(within(dialog).getByRole("link", { name: "Kitap Kulübü" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Hesabımı sil" })).toBeDisabled();
  });
});

describe("projeden ayrılma diyaloğu", () => {
  const project = { id: "ev", name: "Ev Taşınma", color: "mavi" as const, emoji: null };

  it("son yönetici ayrılamaz: uyarı görünür, onay kapalıdır", () => {
    setup(
      <LeaveProjectDialog
        open
        onOpenChange={vi.fn()}
        project={project}
        memberRole="yonetici"
        isLastManager
        onGoToSettings={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Projeden ayrılıyor musun?" });
    expect(within(dialog).getByText("Yönetici · tek yönetici")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Projeden ayrıl" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Proje ayarlarına git" })).toBeEnabled();
  });

  it("diğer üyeler onaylayınca leave eylemi gider ve Notlarım'a dönülür", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { user } = setup(
      <LeaveProjectDialog
        open
        onOpenChange={vi.fn()}
        project={project}
        memberRole="duzenleyici"
        isLastManager={false}
        onGoToSettings={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Projeden ayrıl" }));
    expect(await screen.findByText("Ev Taşınma projesinden ayrıldın")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/projeler/ev");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ intent: "leave" });
  });

  it("sunucu reddederse hata toast olur ve sayfada kalınır", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { ok: false, error: MESSAGES.sonYoneticiAyrilma, code: "son_yonetici" },
          { status: 409 },
        ),
      ),
    );
    const { user } = setup(
      <LeaveProjectDialog
        open
        onOpenChange={vi.fn()}
        project={project}
        memberRole="yonetici"
        isLastManager={false}
        onGoToSettings={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Projeden ayrıl" }));
    expect(await screen.findByText(MESSAGES.sonYoneticiAyrilma)).toBeInTheDocument();
    expect(screen.queryByTestId("konum")).not.toBeInTheDocument();
  });
});

describe("sol menü projeleri", () => {
  const projects = [
    {
      id: "web",
      name: "Web Sitesi Yenileme",
      color: "turuncu" as const,
      role: "yonetici" as const,
    },
    {
      id: "ev",
      name: "Ev Taşınma",
      color: "mavi" as const,
      emoji: "📦",
      role: "duzenleyici" as const,
    },
    { id: "kitap", name: "Kitap Kulübü", color: "yesil" as const, role: "goruntuleyici" as const },
  ];

  it("projeler /proje/:id bağlantısıdır; silinmiş proje bağlantısı yalnızca sayı varsa görünür", () => {
    setup(
      <SidebarNav
        variant="drawer"
        projects={projects}
        pendingInviteCount={0}
        deletedProjectCount={2}
      />,
    );
    expect(screen.getByRole("link", { name: "Ev Taşınma" })).toHaveAttribute("href", "/proje/ev");
    expect(screen.getByRole("link", { name: "Silinmiş projeler (2)" })).toHaveAttribute(
      "href",
      "/silinmis-projeler",
    );
    expect(screen.getByText("📦")).toBeInTheDocument();
  });

  it("silinmiş proje yoksa bağlantı gizlidir; Yeni proje düğmesi diyaloğu ister", async () => {
    const onNewProject = vi.fn();
    const { user } = setup(
      <SidebarNav
        variant="drawer"
        projects={projects}
        pendingInviteCount={0}
        onNewProject={onNewProject}
      />,
    );
    expect(screen.queryByRole("link", { name: /Silinmiş projeler/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeni proje" }));
    expect(onNewProject).toHaveBeenCalledOnce();
  });

  it("Alt+↓ projeyi bir aşağı taşır ve yeni sırayı kaydeder", async () => {
    const { calls, user } = setup(
      <SidebarNav variant="drawer" projects={projects} pendingInviteCount={0} />,
    );
    screen.getByRole("link", { name: "Web Sitesi Yenileme" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/projeler",
      form: { intent: "reorder", order: JSON.stringify(["ev", "web", "kitap"]) },
    });
    const names = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("aria-label"))
      .filter((n) => n && ["Web Sitesi Yenileme", "Ev Taşınma", "Kitap Kulübü"].includes(n));
    expect(names).toEqual(["Ev Taşınma", "Web Sitesi Yenileme", "Kitap Kulübü"]);
    expect(screen.getByRole("link", { name: "Web Sitesi Yenileme" })).toHaveFocus();
  });
});
