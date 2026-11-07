/**
 * E-posta gönderimi.
 *
 * - `RESEND_API_KEY` doluysa Resend HTTP API'si (`fetch`) ile gönderilir; gönderen
 *   `EMAIL_FROM`.
 * - Boşsa (yerel geliştirme, testler) ileti konsola yazılır ve aynı isolate'teki
 *   `globalThis.__sukanoOutbox` dizisine eklenir. Testler bağlantıları buradan okur
 *   (Worker testleri doğrudan, uçtan uca testler `/__test/outbox` ile).
 */
import {
  changeEmailEmail,
  resetPasswordEmail,
  verificationEmail,
  type EmailKind,
  type RenderedEmail,
} from "./email-templates";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type OutboxEntry = EmailMessage & {
  kind?: EmailKind;
  url?: string;
  sentAt: number;
};

declare global {
  var __sukanoOutbox: OutboxEntry[] | undefined;
}

/** Yerel/test posta kutusu (en yeni sonda). En çok 200 ileti tutulur. */
export function getOutbox(): OutboxEntry[] {
  return (globalThis.__sukanoOutbox ??= []);
}

const OUTBOX_LIMIT = 200;

export async function sendEmail(
  env: Env,
  message: EmailMessage,
  meta: { kind?: EmailKind; url?: string } = {},
): Promise<void> {
  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`E-posta gönderilemedi (Resend ${response.status}): ${detail.slice(0, 300)}`);
    }
    return;
  }

  console.log(`[e-posta] Kime: ${message.to} · Konu: ${message.subject}\n${message.text}`);
  const outbox = getOutbox();
  outbox.push({ ...message, ...meta, sentAt: Date.now() });
  if (outbox.length > OUTBOX_LIMIT) outbox.splice(0, outbox.length - OUTBOX_LIMIT);
}

function sendRendered(env: Env, to: string, email: RenderedEmail) {
  return sendEmail(
    env,
    { to, subject: email.subject, text: email.text, html: email.html },
    { kind: email.kind, url: email.url },
  );
}

export function sendVerificationEmail(
  env: Env,
  { to, name, url }: { to: string; name: string; url: string },
) {
  return sendRendered(env, to, verificationEmail({ name, url }));
}

export function sendResetPasswordEmail(
  env: Env,
  { to, name, url }: { to: string; name: string; url: string },
) {
  return sendRendered(env, to, resetPasswordEmail({ name, url }));
}

export function sendChangeEmailVerification(
  env: Env,
  { to, name, url }: { to: string; name: string; url: string },
) {
  return sendRendered(env, to, changeEmailEmail({ name, newEmail: to, url }));
}
