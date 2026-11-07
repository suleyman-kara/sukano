/**
 * Kimlik e-postalarının şablonları: sade HTML (tablo düzeni, satır içi stil;
 * e-posta istemcileri SVG ve <style> desteklemez) + düz metin. Türkçe.
 */

export type EmailKind = "dogrulama" | "sifre-sifirlama" | "eposta-degisikligi";

export type RenderedEmail = {
  kind: EmailKind;
  subject: string;
  text: string;
  html: string;
  /** E-postadaki eylem bağlantısı (testler ve hata ayıklama için). */
  url: string;
};

const ACCENT = "#2E6B55";
const ACCENT_SOFT = "#A9C6BA"; // %35 vurgunun beyaz zemindeki karşılığı
const FG = "#1C1B19";
const MUTED = "#5F5D57";
const BG = "#F7F6F2";
const LINE = "#E4E2DC";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Logo: 2×2 kare ızgara (sol üst ve sağ alt tam renk) + "sukano" kelime işareti. */
function logoHtml(): string {
  const cell = (color: string) =>
    `<td style="width:9px;height:9px;background:${color};border-radius:2px;font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>
<td style="padding-right:10px"><table role="presentation" cellpadding="0" cellspacing="2" style="border-collapse:separate">
<tr>${cell(ACCENT)}${cell(ACCENT_SOFT)}</tr><tr>${cell(ACCENT_SOFT)}${cell(ACCENT)}</tr></table></td>
<td style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${FG}">sukano</td></tr></table>`;
}

function layout({
  title,
  intro,
  action,
  url,
  outro,
}: {
  title: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Onest,Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${FG}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};border-radius:14px">
<tr><td style="padding:28px 32px 8px">${logoHtml()}</td></tr>
<tr><td style="padding:16px 32px 0"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700">${escapeHtml(title)}</h1></td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.6;color:${FG}">${intro}</td></tr>
<tr><td style="padding:24px 32px"><a href="${safeUrl}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escapeHtml(action)}</a></td></tr>
<tr><td style="padding:0 32px;font-size:13px;line-height:1.6;color:${MUTED}">Düğme çalışmazsa bu adresi tarayıcına yapıştır:<br><a href="${safeUrl}" style="color:${ACCENT};word-break:break-all">${safeUrl}</a></td></tr>
<tr><td style="padding:20px 32px 28px;font-size:13px;line-height:1.6;color:${MUTED}">${outro}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:${MUTED}">© 2026 Sukano · Kişisel notların ve ekip projelerin, tek yerde.</p>
</td></tr></table></body></html>`;
}

function text(lines: string[]): string {
  return `${lines.join("\n")}\n\n—\nSukano\n`;
}

export function verificationEmail({ name, url }: { name: string; url: string }): RenderedEmail {
  const title = "E-posta adresini doğrula";
  return {
    kind: "dogrulama",
    url,
    subject: "Sukano: e-posta adresini doğrula",
    html: layout({
      title,
      intro: `Merhaba ${escapeHtml(name)}, Sukano'ya hoş geldin. Hesabını açmak için e-posta adresini doğrula. Doğruladığında projelere davet alabilirsin.`,
      action: "E-postamı doğrula",
      url,
      outro: "Bağlantı 1 saat geçerlidir. Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.",
    }),
    text: text([
      `Merhaba ${name},`,
      "",
      "Sukano hesabını açmak için e-posta adresini doğrula:",
      url,
      "",
      "Bağlantı 1 saat geçerlidir. Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.",
    ]),
  };
}

export function resetPasswordEmail({ name, url }: { name: string; url: string }): RenderedEmail {
  const title = "Şifreni sıfırla";
  return {
    kind: "sifre-sifirlama",
    url,
    subject: "Sukano: şifreni sıfırla",
    html: layout({
      title,
      intro: `Merhaba ${escapeHtml(name)}, Sukano hesabın için şifre sıfırlama isteği aldık. Yeni bir şifre belirlemek için düğmeye tıkla.`,
      action: "Yeni şifre belirle",
      url,
      outro:
        "Bağlantı 1 saat geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.",
    }),
    text: text([
      `Merhaba ${name},`,
      "",
      "Sukano hesabın için şifre sıfırlama isteği aldık. Yeni şifre belirlemek için:",
      url,
      "",
      "Bağlantı 1 saat geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.",
    ]),
  };
}

export function changeEmailEmail({
  name,
  newEmail,
  url,
}: {
  name: string;
  newEmail: string;
  url: string;
}): RenderedEmail {
  const title = "Yeni e-posta adresini doğrula";
  return {
    kind: "eposta-degisikligi",
    url,
    subject: "Sukano: yeni e-posta adresini doğrula",
    html: layout({
      title,
      intro: `Merhaba ${escapeHtml(name)}, Sukano hesabının e-posta adresini <strong>${escapeHtml(newEmail)}</strong> olarak değiştirmek istedin. Değişikliği tamamlamak için bu adresi doğrula.`,
      action: "Yeni adresimi doğrula",
      url,
      outro:
        "Bağlantıya tıklayana kadar eski adresin geçerli kalır. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.",
    }),
    text: text([
      `Merhaba ${name},`,
      "",
      `Sukano hesabının e-posta adresini ${newEmail} olarak değiştirmek istedin. Doğrulamak için:`,
      url,
      "",
      "Bağlantıya tıklayana kadar eski adresin geçerli kalır. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.",
    ]),
  };
}
