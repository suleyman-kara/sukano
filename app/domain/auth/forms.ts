import { isValidEmail, normalizeEmail, validatePassword, validatePasswordPair } from "./rules";

/**
 * Kimlik ve hesap formlarının doğrulaması. İstemci (gönderimden önce) ve sunucu
 * (action) aynı fonksiyonu kullanır; hatalar alan adına göre Türkçe döner.
 */

export type FormResult<T, K extends string = Extract<keyof T, string>> =
  { ok: true; value: T } | { ok: false; errors: Partial<Record<K, string>> };

export const MAX_NAME_LENGTH = 80;

function result<T, K extends string>(
  errors: Partial<Record<K, string>>,
  value: T,
): FormResult<T, K> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

function emailError(raw: string): string | undefined {
  if (!raw.trim()) return "E-posta gerekli.";
  if (!isValidEmail(normalizeEmail(raw))) return "Geçerli bir e-posta adresi yaz.";
  return undefined;
}

function nameError(name: string): string | undefined {
  if (!name) return "Adını yaz.";
  if (name.length > MAX_NAME_LENGTH) return `Ad en fazla ${MAX_NAME_LENGTH} karakter olabilir.`;
  return undefined;
}

/** Ardışık boşlukları teke indirir ve kırpar. */
function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function compact<K extends string>(entries: [K, string | undefined][]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const [key, value] of entries) if (value) out[key] = value;
  return out;
}

export function validateLoginForm(input: { email: string; password: string }) {
  const errors = compact<"email" | "password">([
    ["email", emailError(input.email)],
    ["password", input.password ? undefined : "Şifre gerekli."],
  ]);
  return result(errors, { email: normalizeEmail(input.email), password: input.password });
}

export function validateRegisterForm(input: { name: string; email: string; password: string }) {
  const name = cleanName(input.name);
  const errors = compact<"name" | "email" | "password">([
    ["name", nameError(name)],
    ["email", emailError(input.email)],
    ["password", validatePassword(input.password) ?? undefined],
  ]);
  return result(errors, { name, email: normalizeEmail(input.email), password: input.password });
}

export function validateForgotForm(input: { email: string }) {
  return result(compact<"email">([["email", emailError(input.email)]]), {
    email: normalizeEmail(input.email),
  });
}

export function validateResetForm(input: { password: string; confirm: string }) {
  const errors: Partial<Record<"password" | "confirm", string>> = validatePasswordPair(
    input.password,
    input.confirm,
  );
  return result(errors, { password: input.password });
}

export function validateNameForm(input: { name: string }) {
  const name = cleanName(input.name);
  return result(compact<"name">([["name", nameError(name)]]), { name });
}

export function validateChangeEmailForm(
  input: { email: string; password: string },
  currentEmail: string,
) {
  const email = normalizeEmail(input.email);
  let error = emailError(input.email);
  if (!error && email === normalizeEmail(currentEmail))
    error = "Yeni adres şu anki adresinle aynı.";
  const errors = compact<"email" | "password">([
    ["email", error],
    ["password", input.password ? undefined : "Şifre gerekli."],
  ]);
  return result(errors, { email, password: input.password });
}

export function validateChangePasswordForm(input: {
  current: string;
  password: string;
  confirm: string;
}) {
  const pair = validatePasswordPair(input.password, input.confirm);
  const errors = compact<"current" | "password" | "confirm">([
    ["current", input.current ? undefined : "Mevcut şifreni yaz."],
    ["password", pair.password],
    ["confirm", pair.confirm],
  ]);
  if (!errors.password && !errors.confirm && input.current && input.current === input.password)
    errors.password = "Yeni şifre eskisiyle aynı olamaz.";
  return result(errors, { current: input.current, password: input.password });
}
