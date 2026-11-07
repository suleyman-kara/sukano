/**
 * Proje ve davet eylemlerinin (form verisi) doğrulanması. `/api/projeler`,
 * `/api/projeler/:id` ve `/api/davetler` action'ları kullanır; arayüz aynı tiplerle
 * form gönderir (`intentToForm` ile aynı kurallar: diziler JSON metni).
 */
import { PROJECT_COLORS, PROJECT_ROLES, type ProjectColor, type ProjectRole } from "~/db/schema";
import { MAX_EMAIL_LENGTH } from "~/domain/auth/rules";
import { isNoteId, isUuid } from "~/domain/notes/validation";
import { MESSAGES } from "./permissions";

export const MAX_PROJECT_NAME_LENGTH = 80;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 300;
/** Simge (emoji) için üst sınır (birleşik emojiler birkaç kod birimi tutar). */
export const MAX_EMOJI_LENGTH = 16;
export const MAX_PROJECT_ORDER = 500;

/** Proje, üye ve davet kimlikleri: UUID ya da tohum verisindeki kısa çizgili adlar. */
export const isProjectId = isNoteId;
const isRefId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_@.+-]{1,200}$/.test(v);

export const isProjectColor = (v: unknown): v is ProjectColor =>
  typeof v === "string" && (PROJECT_COLORS as readonly string[]).includes(v);
export const isProjectRole = (v: unknown): v is ProjectRole =>
  typeof v === "string" && (PROJECT_ROLES as readonly string[]).includes(v);

export type ProjectFields = {
  name: string;
  color: ProjectColor;
  description: string | null;
  emoji: string | null;
};

/** `POST /api/projeler` */
export type ProjectsIntent =
  ({ intent: "create"; id?: string } & ProjectFields) | { intent: "reorder"; order: string[] };

/** `POST /api/projeler/:id` */
export type ProjectIntent =
  | ({ intent: "update" } & Partial<ProjectFields>)
  | { intent: "delete" | "restore" | "leave" }
  | { intent: "invite"; email: string; role: ProjectRole }
  | { intent: "revoke-invite"; invitationId: string }
  | { intent: "set-role"; userId: string; role: ProjectRole }
  | { intent: "remove-member"; userId: string };

/** `POST /api/davetler` */
export type InviteIntent = { intent: "accept" | "decline"; id: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Input = Record<string, unknown>;

class Invalid extends Error {}
const bad = (message: string): never => {
  throw new Invalid(message);
};
function attempt<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    /* v8 ignore next */
    if (!(error instanceof Invalid)) throw error;
    return { ok: false, error: error.message };
  }
}

const present = (input: Input, key: string) => input[key] !== undefined && input[key] !== null;

function name(v: unknown): string {
  if (typeof v !== "string") return bad("Proje adı gerekli");
  const trimmed = v.trim();
  if (!trimmed) return bad("Proje adı gerekli");
  if (trimmed.length > MAX_PROJECT_NAME_LENGTH) return bad("Proje adı çok uzun");
  return trimmed;
}

function color(v: unknown): ProjectColor {
  return isProjectColor(v) ? v : bad("Geçersiz renk");
}

/** Boş metin `null` olur. */
function optionalText(v: unknown, max: number, error: string): string | null {
  if (typeof v !== "string") return bad(error);
  const trimmed = v.trim();
  if (trimmed.length > max) return bad(error);
  return trimmed || null;
}

const description = (v: unknown) =>
  optionalText(v, MAX_PROJECT_DESCRIPTION_LENGTH, "Açıklama çok uzun");
const emoji = (v: unknown) => optionalText(v, MAX_EMOJI_LENGTH, "Geçersiz simge");

function order(v: unknown): string[] {
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return bad("Geçersiz sıra");
    }
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_PROJECT_ORDER || !parsed.every(isProjectId))
    return bad("Geçersiz sıra");
  return parsed as string[];
}

export function parseProjectsIntent(input: Input): Result<ProjectsIntent> {
  return attempt((): ProjectsIntent => {
    switch (input.intent) {
      case "create": {
        if (present(input, "id") && !isUuid(input.id)) bad("Geçersiz proje kimliği");
        return {
          intent: "create",
          ...(present(input, "id") ? { id: input.id as string } : {}),
          name: name(input.name),
          color: present(input, "color") ? color(input.color) : "yesil",
          description: present(input, "description") ? description(input.description) : null,
          emoji: present(input, "emoji") ? emoji(input.emoji) : null,
        };
      }
      case "reorder":
        return { intent: "reorder", order: order(input.order) };
      default:
        return bad("Bilinmeyen işlem");
    }
  });
}

export function parseProjectIntent(input: Input): Result<ProjectIntent> {
  return attempt((): ProjectIntent => {
    switch (input.intent) {
      case "update": {
        const out: Extract<ProjectIntent, { intent: "update" }> = { intent: "update" };
        if (present(input, "name")) out.name = name(input.name);
        if (present(input, "color")) out.color = color(input.color);
        if (present(input, "description")) out.description = description(input.description);
        if (present(input, "emoji")) out.emoji = emoji(input.emoji);
        if (Object.keys(out).length === 1) bad("Değişiklik yok");
        return out;
      }
      case "delete":
      case "restore":
      case "leave":
        return { intent: input.intent };
      case "invite": {
        const email = input.email;
        if (typeof email !== "string" || email.length > MAX_EMAIL_LENGTH)
          bad(MESSAGES.gecersizEposta);
        const role = input.role ?? "duzenleyici";
        if (!isProjectRole(role)) bad("Geçersiz rol");
        return { intent: "invite", email: email as string, role: role as ProjectRole };
      }
      case "revoke-invite":
        if (!isRefId(input.invitationId)) bad("Geçersiz davet");
        return { intent: "revoke-invite", invitationId: input.invitationId as string };
      case "set-role":
        if (!isRefId(input.userId)) bad("Geçersiz üye");
        if (!isProjectRole(input.role)) bad("Geçersiz rol");
        return {
          intent: "set-role",
          userId: input.userId as string,
          role: input.role as ProjectRole,
        };
      case "remove-member":
        if (!isRefId(input.userId)) bad("Geçersiz üye");
        return { intent: "remove-member", userId: input.userId as string };
      default:
        return bad("Bilinmeyen işlem");
    }
  });
}

export function parseInviteIntent(input: Input): Result<InviteIntent> {
  return attempt((): InviteIntent => {
    if (input.intent !== "accept" && input.intent !== "decline") return bad("Bilinmeyen işlem");
    if (!isRefId(input.id)) bad("Geçersiz davet");
    return { intent: input.intent, id: input.id as string };
  });
}
