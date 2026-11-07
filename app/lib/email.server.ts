/**
 * E-posta gönderimi. ŞİMDİLİK YER TUTUCU: iletiyi konsola yazar.
 * Aşama 1'de Resend (`RESEND_API_KEY`, gönderen `EMAIL_FROM`) bağlanacak; testlerde
 * sahte servis kullanılacak.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(_env: Env, message: EmailMessage): Promise<void> {
  // TODO(Aşama 1): env.RESEND_API_KEY doluysa Resend API'sine gönder.
  console.log(`[e-posta] Kime: ${message.to} · Konu: ${message.subject}\n${message.text}`);
}

export function sendVerificationEmail(
  env: Env,
  { to, name, url }: { to: string; name: string; url: string },
) {
  return sendEmail(env, {
    to,
    subject: "Sukano: e-posta adresini doğrula",
    text: `Merhaba ${name},\n\nHesabını etkinleştirmek için bağlantıya tıkla:\n${url}\n`,
  });
}

export function sendResetPasswordEmail(
  env: Env,
  { to, name, url }: { to: string; name: string; url: string },
) {
  return sendEmail(env, {
    to,
    subject: "Sukano: şifreni sıfırla",
    text: `Merhaba ${name},\n\nYeni şifre belirlemek için bağlantıya tıkla:\n${url}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.\n`,
  });
}
