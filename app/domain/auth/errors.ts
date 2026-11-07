import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./rules";
import { RATE_LIMIT_MESSAGE } from "./rate-limit";

const EXISTS = "Bu e-posta adresiyle zaten bir hesap var. Giriş yap ya da şifreni sıfırla.";

/** Better Auth hata kodları (ve bizim eklediklerimiz) → Türkçe metin. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-posta ya da şifre hatalı.",
  EMAIL_NOT_VERIFIED: "E-posta adresin henüz doğrulanmadı.",
  USER_ALREADY_EXISTS: EXISTS,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: EXISTS,
  PASSWORD_TOO_SHORT: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`,
  PASSWORD_TOO_LONG: `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`,
  INVALID_EMAIL: "Geçerli bir e-posta adresi yaz.",
  INVALID_TOKEN: "Bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı iste.",
  TOKEN_EXPIRED: "Bağlantının süresi dolmuş. Yeni bir bağlantı iste.",
  INVALID_PASSWORD: "Mevcut şifre hatalı.",
  TOO_MANY_REQUESTS: RATE_LIMIT_MESSAGE,
  CAPTCHA_FAILED: "Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyip tekrar dene.",
};

export const GENERIC_ERROR = "Bir şeyler ters gitti. Lütfen tekrar dene.";

export function authErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || GENERIC_ERROR;
}
