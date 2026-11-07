import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "~/components/auth/login-form";
import { RegisterForm } from "~/components/auth/register-form";

function renderLogin(props: Partial<React.ComponentProps<typeof LoginForm>> = {}) {
  const action = vi.fn(() => null);
  const Stub = createRoutesStub([
    {
      path: "/giris",
      action,
      Component: () => <LoginForm googleEnabled={false} next="/" {...props} />,
    },
  ]);
  render(<Stub initialEntries={["/giris"]} />);
  return { action, user: userEvent.setup() };
}

function renderRegister(props: Partial<React.ComponentProps<typeof RegisterForm>> = {}) {
  const action = vi.fn(() => null);
  const Stub = createRoutesStub([
    {
      path: "/kayit",
      action,
      Component: () => (
        <RegisterForm
          googleEnabled={false}
          turnstileSiteKey="1x00000000000000000000AA"
          next="/"
          {...props}
        />
      ),
    },
  ]);
  render(<Stub initialEntries={["/kayit"]} />);
  return { action, user: userEvent.setup() };
}

describe("giriş formu", () => {
  it("boş gönderimde alan hatalarını gösterir, sunucuya gitmez ve ilk alana odaklanır", async () => {
    const { action, user } = renderLogin();
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));

    expect(await screen.findByText("E-posta gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Şifre gerekli.")).toBeInTheDocument();
    const email = screen.getByLabelText("E-posta");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("E-posta gerekli.");
    expect(email).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("geçersiz e-postada uyarır; düzeltilince gönderir", async () => {
    const { action, user } = renderLogin();
    await user.type(screen.getByLabelText("E-posta"), "ayse");
    await user.type(screen.getByLabelText("Şifre", { selector: "input" }), "Test1234!");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByText("Geçerli bir e-posta adresi yaz.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("E-posta"), "@test.sukano");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("sunucu hatasını form üstünde gösterir", () => {
    renderLogin({ actionData: { formError: "E-posta ya da şifre hatalı.", email: "a@b.co" } });
    expect(screen.getByRole("alert")).toHaveTextContent("E-posta ya da şifre hatalı.");
    expect(screen.getByLabelText("E-posta")).toHaveValue("a@b.co");
  });

  it("şifre göster/gizle düğmesi alan türünü değiştirir", async () => {
    const { user } = renderLogin();
    const password = screen.getByLabelText("Şifre", { selector: "input" });
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Şifreyi göster" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Şifreyi gizle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Google düğmesi yalnızca Google etkinse görünür", () => {
    renderLogin();
    expect(screen.queryByRole("button", { name: "Google ile devam et" })).toBeNull();
  });

  it("next parametresini kayıt ve şifremi unuttum bağlantılarında korur", () => {
    renderLogin({ next: "/ayarlar" });
    expect(screen.getByRole("link", { name: "Şifremi unuttum" })).toHaveAttribute(
      "href",
      "/sifremi-unuttum?next=%2Fayarlar",
    );
    expect(screen.getAllByRole("link", { name: "Kayıt ol" })[0]).toHaveAttribute(
      "href",
      "/kayit?next=%2Fayarlar",
    );
  });
});

describe("kayıt formu", () => {
  it("ad, e-posta ve şifre kurallarını gönderimden önce gösterir", async () => {
    const { action, user } = renderRegister();
    await user.type(screen.getByLabelText("E-posta"), "deniz@ornek");
    await user.type(screen.getByLabelText("Şifre", { selector: "input" }), "kisa");
    await user.click(screen.getByRole("button", { name: "Kayıt ol" }));

    expect(await screen.findByText("Adını yaz.")).toBeInTheDocument();
    expect(screen.getByText("Geçerli bir e-posta adresi yaz.")).toBeInTheDocument();
    expect(screen.getByText("Şifre en az 8 karakter olmalı.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("Turnstile bilgilendirme satırını ve şifre ipucunu gösterir", () => {
    renderRegister();
    expect(screen.getByText("Bu form Cloudflare Turnstile ile korunur.")).toBeInTheDocument();
    expect(screen.getByLabelText("Şifre", { selector: "input" })).toHaveAccessibleDescription(
      "En az 8 karakter.",
    );
  });

  it("sunucudan gelen alan hatasını gösterir (var olan e-posta)", () => {
    renderRegister({
      actionData: {
        errors: {
          email: "Bu e-posta adresiyle zaten bir hesap var. Giriş yap ya da şifreni sıfırla.",
        },
        values: { name: "Deniz", email: "ayse@test.sukano" },
      },
    });
    expect(screen.getByLabelText("E-posta")).toHaveAccessibleDescription(
      "Bu e-posta adresiyle zaten bir hesap var. Giriş yap ya da şifreni sıfırla.",
    );
    expect(screen.getByLabelText("Ad Soyad")).toHaveValue("Deniz");
  });
});
