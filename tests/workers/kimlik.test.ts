import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  cookieFrom,
  freshEmail,
  freshIp,
  get,
  lastMail,
  login,
  mailsTo,
  PASSWORD,
  pathOf,
  postForm,
  postJson,
  register,
  sessionOf,
  TURNSTILE_TOKEN,
  verifiedUser,
} from "./kimlik-yardimcilar";

const testEnv = env as unknown as Env;

describe("kayıt ve e-posta doğrulama", () => {
  it("kayıt doğrulama e-postası gönderir; bağlantı hesabı doğrular, oturum açar ve /'a gönderir", async () => {
    const email = freshEmail("kayit");
    const res = await register(email);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/dogrula?eposta=${encodeURIComponent(email)}`);
    // Kayıtta oturum açılmaz (doğrulama zorunlu).
    expect(cookieFrom(res)).toBe("");

    const mail = lastMail(email, "dogrulama");
    expect(mail.subject).toBe("Sukano: e-posta adresini doğrula");
    expect(mail.text).toContain("Merhaba Deniz Yılmaz");
    expect(mail.html).toContain("sukano");
    expect(mail.url).toMatch(/^http:\/\/sukano\.test\/dogrula\/[\w-]+\.[\w-]+\.[\w-]+$/);

    const verify = await get(pathOf(mail.url));
    expect(verify.status).toBe(302);
    expect(verify.headers.get("location")).toBe("/");
    const cookie = cookieFrom(verify);
    expect(cookie).toContain("better-auth.session_token=");

    expect((await sessionOf(cookie))?.user.email).toBe(email);
    const home = await get("/", { cookie });
    expect(home.status).toBe(200);
  });

  it("doğrulandıktan sonra e-posta ve şifreyle giriş yapılır ve oturum açılır", async () => {
    const { email } = await verifiedUser();
    const res = await login(email);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const cookie = cookieFrom(res);
    expect((await sessionOf(cookie))?.user.email).toBe(email);
  });

  it("next parametresi kayıttan doğrulama bağlantısına ve sonrasına taşınır", async () => {
    const email = freshEmail("next");
    const res = await postForm(
      "/kayit",
      {
        name: "Ece",
        email,
        password: PASSWORD,
        "cf-turnstile-response": TURNSTILE_TOKEN,
        next: "/ayarlar",
      },
      { ip: freshIp() },
    );
    expect(res.headers.get("location")).toBe(
      `/dogrula?eposta=${encodeURIComponent(email)}&next=%2Fayarlar`,
    );
    const link = lastMail(email, "dogrulama").url!;
    expect(link).toContain("?next=%2Fayarlar");
    const verify = await get(pathOf(link));
    expect(verify.headers.get("location")).toBe("/ayarlar");
  });

  it("var olan e-postayla kayıt Türkçe hata verir", async () => {
    const { email } = await verifiedUser();
    const res = await register(email);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Bu e-posta adresiyle zaten bir hesap var.");
  });

  it("zayıf ya da kısa şifreyle kayıt reddedilir", async () => {
    const short = await register(freshEmail(), { password: "kisa1" });
    expect(short.status).toBe(400);
    expect(await short.text()).toContain("Şifre en az 8 karakter olmalı.");

    const common = await register(freshEmail(), { password: "password" });
    expect(await common.text()).toContain("Bu şifre çok yaygın");
  });

  it("geçersiz doğrulama bağlantısı Türkçe hata sayfası gösterir", async () => {
    const res = await get("/dogrula/gecersiz.jeton.degeri");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("E-posta doğrulanamadı");
  });
});

describe("giriş", () => {
  it("yanlış şifrede Türkçe hata verir ve oturum açmaz", async () => {
    const { email } = await verifiedUser();
    const res = await login(email, "Yanlis-sifre-1");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("E-posta ya da şifre hatalı.");
    expect(cookieFrom(res)).toBe("");
  });

  it("doğrulanmamış hesapla giriş reddedilir, doğrulama ekranına yönlendirilir ve yeni bağlantı gönderilir", async () => {
    const email = freshEmail("dogrulanmamis");
    await register(email);
    const before = mailsTo(email).length;

    const res = await login(email);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/dogrula?eposta=${encodeURIComponent(email)}&neden=dogrulanmadi`,
    );
    expect(cookieFrom(res)).toBe("");
    expect(mailsTo(email).length).toBe(before + 1);
  });

  it("boş alanları sunucu da reddeder", async () => {
    const res = await postForm("/giris", { email: "", password: "", intent: "email" });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("E-posta gerekli.");
    expect(html).toContain("Şifre gerekli.");
  });

  it("çıkış oturumu kapatır ve /giris'e döner", async () => {
    const { cookie } = await verifiedUser();
    const res = await postForm("/cikis", {}, { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/giris");
    const after = cookieFrom(res, cookie);
    expect(await sessionOf(after)).toBeNull();
  });
});

describe("şifre sıfırlama", () => {
  it("sıfırlama bağlantısıyla yeni şifre belirlenir, oturum açılır; eski şifre artık geçmez", async () => {
    const { email } = await verifiedUser();

    const req = await postForm(
      "/sifremi-unuttum",
      { email, "cf-turnstile-response": TURNSTILE_TOKEN },
      { ip: freshIp() },
    );
    expect(req.status).toBe(200);
    expect(await req.text()).toContain("E-postanı kontrol et");

    const mail = lastMail(email, "sifre-sifirlama");
    expect(mail.subject).toBe("Sukano: şifreni sıfırla");
    expect(mail.url).toMatch(/^http:\/\/sukano\.test\/sifre-sifirla\?token=/);
    const token = new URL(mail.url!).searchParams.get("token")!;

    const mismatch = await postForm("/sifre-sifirla?token=" + token, {
      token,
      password: "Yeni-sifre-2026",
      confirm: "Baska-sifre-2026",
    });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.text()).toContain("Şifreler aynı değil.");

    const reset = await postForm("/sifre-sifirla?token=" + token, {
      token,
      password: "Yeni-sifre-2026",
      confirm: "Yeni-sifre-2026",
    });
    expect(reset.status).toBe(302);
    expect(reset.headers.get("location")).toBe("/");
    expect((await sessionOf(cookieFrom(reset)))?.user.email).toBe(email);

    expect((await login(email, PASSWORD)).status).toBe(400);
    expect((await login(email, "Yeni-sifre-2026")).status).toBe(302);
  });

  it("kayıtlı olmayan adres için de aynı yanıtı verir ve e-posta göndermez", async () => {
    const email = freshEmail("yok");
    const res = await postForm(
      "/sifremi-unuttum",
      { email, "cf-turnstile-response": TURNSTILE_TOKEN },
      { ip: freshIp() },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("E-postanı kontrol et");
    expect(mailsTo(email)).toHaveLength(0);
  });

  it("geçersiz jetonla sıfırlama Türkçe hata verir", async () => {
    const res = await postForm("/sifre-sifirla?token=yok", {
      token: "yok",
      password: "Yeni-sifre-2026",
      confirm: "Yeni-sifre-2026",
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Bağlantı geçersiz ya da süresi dolmuş.");
  });
});

describe("hız sınırı", () => {
  it("aynı e-postayla dakikada 5'ten fazla giriş denemesi 429 ve Türkçe hata verir", async () => {
    const { email } = await verifiedUser();
    for (let i = 0; i < 5; i++) {
      expect((await login(email, "Yanlis-sifre-1")).status).toBe(400);
    }
    // Doğru şifre bile sınır aşıldıysa reddedilir; farklı IP'den gelse de.
    const res = await login(email, PASSWORD);
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("Çok fazla deneme yaptın.");
  });

  it("aynı IP'den dakikada 20'den fazla kayıt denemesi reddedilir", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) {
      const res = await postJson(
        "/api/auth/sign-up/email",
        { name: "x", email: freshEmail("ip"), password: "kisa" },
        { ip, headers: { "x-captcha-response": TURNSTILE_TOKEN } },
      );
      expect(res.status).not.toBe(429);
    }
    const res = await postJson(
      "/api/auth/sign-up/email",
      { name: "x", email: freshEmail("ip"), password: PASSWORD },
      { ip, headers: { "x-captcha-response": TURNSTILE_TOKEN } },
    );
    expect(res.status).toBe(429);
    expect(((await res.json()) as { code: string }).code).toBe("TOO_MANY_REQUESTS");
  });

  it("şifre sıfırlama isteği de e-posta başına sınırlıdır", async () => {
    const email = freshEmail("sifirlama");
    for (let i = 0; i < 5; i++) {
      const ok = await postForm(
        "/sifremi-unuttum",
        { email, "cf-turnstile-response": TURNSTILE_TOKEN },
        { ip: freshIp() },
      );
      expect(ok.status).toBe(200);
    }
    const res = await postForm(
      "/sifremi-unuttum",
      { email, "cf-turnstile-response": TURNSTILE_TOKEN },
      { ip: freshIp() },
    );
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("Çok fazla deneme yaptın.");
  });
});

describe("Turnstile", () => {
  it("test gizli anahtarıyla dolu jeton geçer", async () => {
    const res = await postJson(
      "/api/auth/sign-up/email",
      { name: "Turnstile", email: freshEmail("ts"), password: PASSWORD },
      { ip: freshIp(), headers: { "x-captcha-response": TURNSTILE_TOKEN } },
    );
    expect(res.status).toBe(200);
  });

  it("boş jeton reddedilir (doğrudan API isteği)", async () => {
    const email = freshEmail("ts-bos");
    const res = await postJson(
      "/api/auth/sign-up/email",
      { name: "Turnstile", email, password: PASSWORD },
      { ip: freshIp() },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("CAPTCHA_FAILED");
    expect(mailsTo(email)).toHaveLength(0);
  });

  it("boş jetonla kayıt formu Türkçe hata gösterir", async () => {
    const res = await register(freshEmail(), { token: "" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Güvenlik doğrulaması tamamlanamadı.");
  });

  it("şifre sıfırlama isteği de jeton ister", async () => {
    const res = await postForm("/sifremi-unuttum", { email: freshEmail() }, { ip: freshIp() });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Güvenlik doğrulaması tamamlanamadı.");
  });
});

describe("rota koruması", () => {
  it("oturumsuz korumalı rota /giris?next= adresine yönlendirir", async () => {
    const res = await get("/ayarlar");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/giris?next=%2Fayarlar");
  });

  it("kök için next eklenmez; sorgu korunur", async () => {
    expect((await get("/")).headers.get("location")).toBe("/giris");
    expect((await get("/ayarlar?sekme=hesap")).headers.get("location")).toBe(
      "/giris?next=%2Fayarlar%3Fsekme%3Dhesap",
    );
  });

  it("bilinmeyen yollar da oturum ister (varsayılan kapalı)", async () => {
    expect((await get("/bilinmeyen")).status).toBe(302);
  });

  it("kimlik sayfaları ve sağlık denetimi oturumsuz açılır", async () => {
    for (const path of ["/giris", "/kayit", "/sifremi-unuttum", "/dogrula", "/health"]) {
      expect((await get(path)).status, path).toBe(200);
    }
  });

  it("oturum açıkken kimlik sayfaları next'e ya da /'a yönlendirir", async () => {
    const { cookie } = await verifiedUser();
    const res = await get("/giris", { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const withNext = await get("/kayit?next=%2Fayarlar", { cookie });
    expect(withNext.headers.get("location")).toBe("/ayarlar");
    const evil = await get("/giris?next=https%3A%2F%2Fkotu.example", { cookie });
    expect(evil.headers.get("location")).toBe("/");
  });

  it("giriş sonrası güvensiz next yok sayılır", async () => {
    const { email } = await verifiedUser();
    const res = await postForm(
      "/giris",
      { email, password: PASSWORD, intent: "email", next: "//kotu.example" },
      { ip: freshIp() },
    );
    expect(res.headers.get("location")).toBe("/");
  });
});

describe("Ayarlar > Hesap", () => {
  it("adı değiştirir", async () => {
    const { cookie } = await verifiedUser();
    const res = await postForm("/ayarlar", { intent: "profile", name: "  Yeni   Ad " }, { cookie });
    expect(res.status).toBe(200);
    expect((await sessionOf(cookie))?.user.name).toBe("Yeni Ad");
  });

  it("temayı user_preferences'a yazar", async () => {
    const { email, cookie } = await verifiedUser();
    const res = await postForm("/ayarlar", { intent: "theme", theme: "dark" }, { cookie });
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(
      "select p.theme from user_preferences p join user u on u.id = p.user_id where u.email = ?",
    )
      .bind(email)
      .first<{ theme: string }>();
    expect(row?.theme).toBe("dark");
  });

  it("şifre değiştirir; mevcut şifre yanlışsa reddeder", async () => {
    const { email, cookie } = await verifiedUser();
    const wrong = await postForm(
      "/ayarlar",
      {
        intent: "password",
        current: "Yanlis-1234",
        password: "Yepyeni-2026",
        confirm: "Yepyeni-2026",
      },
      { cookie },
    );
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain("Mevcut şifre hatalı.");

    const ok = await postForm(
      "/ayarlar",
      { intent: "password", current: PASSWORD, password: "Yepyeni-2026", confirm: "Yepyeni-2026" },
      { cookie },
    );
    expect(ok.status).toBe(200);
    expect((await login(email, "Yepyeni-2026")).status).toBe(302);
  });

  it("e-posta değişikliği şifre ister ve yeni adrese doğrulama gönderir; bağlantı adresi değiştirir", async () => {
    const { email, cookie } = await verifiedUser();
    const newEmail = freshEmail("yeni");

    const wrong = await postForm(
      "/ayarlar",
      { intent: "email", email: newEmail, password: "Yanlis-1234" },
      { cookie },
    );
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain("Şifre hatalı.");
    expect(mailsTo(newEmail)).toHaveLength(0);

    const ok = await postForm(
      "/ayarlar",
      { intent: "email", email: newEmail, password: PASSWORD },
      { cookie },
    );
    expect(ok.status).toBe(200);
    const mail = lastMail(newEmail, "eposta-degisikligi");
    expect(mail.subject).toBe("Sukano: yeni e-posta adresini doğrula");
    // Bağlantıya tıklanana kadar eski adres geçerli.
    expect((await sessionOf(cookie))?.user.email).toBe(email);

    const verify = await get(pathOf(mail.url), { cookie });
    expect(verify.status).toBe(302);
    expect(verify.headers.get("location")).toBe("/ayarlar?durum=eposta-degisti#hesap");
    expect((await sessionOf(cookieFrom(verify, cookie)))?.user.email).toBe(newEmail);
  });

  it("diğer cihazlardaki oturumları kapatır", async () => {
    const { email, cookie } = await verifiedUser();
    const other = cookieFrom(await login(email));
    expect(await sessionOf(other)).not.toBeNull();

    const res = await postForm("/ayarlar", { intent: "revoke-others" }, { cookie });
    expect(res.status).toBe(200);
    expect(await sessionOf(other)).toBeNull();
    expect(await sessionOf(cookie)).not.toBeNull();
  });

  it("başka kökenden gelen ayar isteği reddedilir", async () => {
    const { cookie } = await verifiedUser();
    const res = await postForm(
      "/ayarlar",
      { intent: "profile", name: "Saldırgan" },
      { cookie, headers: { origin: "https://kotu.example" } },
    );
    expect([400, 403]).toContain(res.status);
    expect((await sessionOf(cookie))?.user.name).not.toBe("Saldırgan");
  });
});

describe("test posta kutusu", () => {
  it("geliştirme/test ortamında /__test/outbox iletileri döner", async () => {
    const email = freshEmail("outbox");
    await register(email);
    const res = await get(`/__test/outbox?to=${encodeURIComponent(email)}`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { kind: string; url: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("dogrulama");
  });

  it("Resend anahtarı tanımlıyken (üretim) 404 döner", async () => {
    const { loader } = await import("~/routes/__test.outbox");
    const { RouterContextProvider } = await import("react-router");
    const { cloudflareContext } = await import("~/lib/context");
    const context = new RouterContextProvider();
    context.set(cloudflareContext, {
      env: { ...testEnv, RESEND_API_KEY: "re_gercek" } as Env,
      ctx: {} as ExecutionContext,
    });
    const res = (await loader({
      request: new Request("http://sukano.test/__test/outbox"),
      context,
      params: {},
    } as never)) as Response;
    expect(res.status).toBe(404);
  });
});
