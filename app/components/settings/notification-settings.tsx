import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  disablePush,
  enablePush,
  pushStatus,
  type PushStatus,
} from "~/components/notifications/push-client";
import { NOTIFICATIONS_API } from "~/components/notifications/use-notifications";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import type { PrefKey, Prefs } from "~/domain/notifications/prefs";

const ROWS: { key: PrefKey; title: string; detail: string; aria: string }[] = [
  {
    key: "push.hatirlatici",
    title: "Hatırlatıcılar",
    detail: "Not ve görev hatırlatıcıları zamanı gelince",
    aria: "Hatırlatıcı bildirimleri",
  },
  {
    key: "push.goreveAtandi",
    title: "Göreve atanma",
    detail: "Biri seni bir göreve atadığında",
    aria: "Atanma bildirimleri",
  },
  {
    key: "push.davet",
    title: "Davetler",
    detail: "Bir projeye davet edildiğinde",
    aria: "Davet bildirimleri",
  },
  {
    key: "email.davet",
    title: "Davet e-postası",
    detail: "Davetleri ayrıca e-posta ile al",
    aria: "Davet e-postası",
  },
];

const STATUS_TEXT: Record<PushStatus, string> = {
  acik: "Tarayıcı bildirimleri bu cihazda açık. Telefonda almak için Sukano'yu ana ekrana ekle.",
  kapali: "Tarayıcı bildirimleri bu cihazda kapalı. Uygulama içi bildirimler zilde görünür.",
  engellendi:
    "Bildirim izni bu tarayıcıda engelli; açmak için tarayıcının site ayarlarından izin ver.",
  desteklenmiyor: "Bu tarayıcı bildirimleri desteklemiyor. Uygulama içi bildirimler zilde görünür.",
  "sunucuda-kapali":
    "Tarayıcı bildirimleri henüz yapılandırılmadı. Uygulama içi bildirimler zilde görünür.",
};

const get = (prefs: Prefs, key: PrefKey) => {
  const [group, name] = key.split(".") as ["push" | "email", string];
  return (prefs[group] as Record<string, boolean>)[name] ?? true;
};

/**
 * Ayarlar → Bildirimler (Settings, TSettings, MSettings): bu cihazın tarayıcı bildirimi
 * durumu (izin yalnızca "Bu cihazda aç" ile istenir) ve tür başına anahtarlar. Anahtarlar
 * hemen kaydedilir; hata olursa geri döner.
 */
export function NotificationSettings({
  prefs: initial,
  fetchImpl = (...a) => fetch(...a),
}: {
  prefs: Prefs;
  fetchImpl?: typeof fetch;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    pushStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus("kapali"));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (key: PrefKey, value: boolean) => {
    const before = prefs;
    const [group, name] = key.split(".") as ["push" | "email", string];
    setPrefs({ ...prefs, [group]: { ...prefs[group], [name]: value } } as Prefs);
    try {
      const res = await fetchImpl(NOTIFICATIONS_API, {
        method: "POST",
        body: new URLSearchParams({ intent: "pref", key, value: value ? "1" : "0" }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setPrefs(before);
      toast.error("Ayar kaydedilemedi. Tekrar dene.");
    }
  };

  const device = async (on: boolean) => {
    setBusy(true);
    try {
      const next = on ? await enablePush() : await disablePush();
      setStatus(next);
      if (on && next === "engellendi") toast(STATUS_TEXT.engellendi);
    } catch {
      toast.error("Tarayıcı bildirimleri açılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="m-0 min-w-[200px] flex-1 text-muted-foreground" aria-live="polite">
          {status ? STATUS_TEXT[status] : " "}
        </p>
        {(status === "kapali" || status === "acik") && (
          <Button
            type="button"
            variant="outline"
            className="border-line bg-surface hover:bg-hover"
            disabled={busy}
            onClick={() => void device(status === "kapali")}
          >
            {status === "kapali" ? "Bu cihazda aç" : "Bu cihazda kapat"}
          </Button>
        )}
      </div>
      <div>
        {ROWS.map((row) => {
          const id = `bildirim-${row.key.replace(".", "-")}`;
          return (
            <div
              key={row.key}
              className="flex items-center gap-3 border-t border-line py-3 first:border-t-0"
            >
              <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
                <b className="font-medium">{row.title}</b>
                <small className="text-[13px] text-muted-foreground">{row.detail}</small>
              </label>
              <Switch
                id={id}
                checked={get(prefs, row.key)}
                aria-label={row.aria}
                onCheckedChange={(v) => void toggle(row.key, v)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
