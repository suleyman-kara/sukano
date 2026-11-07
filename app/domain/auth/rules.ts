/**
 * Kimlik doğrulamanın saf kuralları (PLAN §6 Güvenlik): şifre ve e-posta.
 * Sunucu (Better Auth yapılandırması, action'lar) ve istemci (form doğrulaması)
 * aynı kuralları kullanır.
 */

export const MIN_PASSWORD_LENGTH = 8;
/** Better Auth varsayılanıyla aynı; scrypt maliyetini sınırlar. */
export const MAX_PASSWORD_LENGTH = 128;
/** RFC 5321'e göre bir adresin en fazla uzunluğu. */
export const MAX_EMAIL_LENGTH = 254;

/** Bilinen en yaygın şifreler (küçük harfle). Uzunluk kuralını geçenler yeterli. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "qwertyuiop",
  "iloveyou",
  "sifre123",
  "sifresifre",
  "parola123",
  "11111111",
  "12345678",
  "00000000",
  "abcdefgh",
  "asdfghjk",
  "qwerty123",
  "1q2w3e4r",
  "123456789",
  "1234567890",
]);

/** Şifre kuralı. Geçerliyse `null`, değilse Türkçe hata metni. */
export function validatePassword(password: string): string | null {
  if (!password) return "Şifre gerekli.";
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
  if (password.length > MAX_PASSWORD_LENGTH)
    return `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`;
  if (!password.trim()) return "Şifre yalnızca boşluktan oluşamaz.";
  if (COMMON_PASSWORDS.has(password.toLowerCase()))
    return "Bu şifre çok yaygın; daha güçlü bir şifre seç.";
  return null;
}

/** Yeni şifre + tekrarı. Hatalar alan adına göre döner (`password`, `confirm`). */
export function validatePasswordPair(
  password: string,
  confirm: string,
): { password?: string; confirm?: string } {
  const error = validatePassword(password);
  if (error) return { password: error };
  if (password !== confirm) return { confirm: "Şifreler aynı değil." };
  return {};
}

/**
 * E-posta normalizasyonu: kırp + küçük harf. `toLowerCase()` dil bağımsızdır
 * ("I" → "i"); Türkçe yerel ayarıyla küçültmek adresleri bozardı.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Bilinçli olarak sade: yerel kısım + "@" + en az bir noktalı alan adı, boşluk yok.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}
