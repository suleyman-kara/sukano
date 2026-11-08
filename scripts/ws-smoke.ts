/**
 * NoteRoom duman testi: tohum kullanıcısıyla giriş yapar, bir not odasına iki
 * WebSocket bağlantısı açar; ikisi de `hosgeldin` alır, `kaydet` iletisi `kaydedildi`
 * ile yanıtlanır, oturumsuz bağlantı reddedilir.
 *
 *   npm run dev            # başka bir terminalde
 *   npx tsx scripts/ws-smoke.ts [http://localhost:5173]
 */
import { hesaplar } from "../tests/fixtures/hesaplar";

const base = process.argv[2] ?? "http://localhost:5173";

const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({ email: hesaplar.suleyman.eposta, password: hesaplar.suleyman.sifre }),
});
if (!signIn.ok) throw new Error(`Giriş başarısız: ${signIn.status} ${await signIn.text()}`);
const cookie = signIn.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");

const url = `${base.replace(/^http/, "ws")}/api/notlar/lansman-hazirligi/canli`;

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    // Node'un yerleşik WebSocket'i (undici) başlık seçeneğini destekler.
    const ws = new WebSocket(url, { headers: { Cookie: cookie } } as unknown as string[]);
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", (e) => reject(new Error(`Bağlantı hatası: ${String(e)}`)), {
      once: true,
    });
  });
}

const nextMessage = (ws: WebSocket) =>
  new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Zaman aşımı")), 5000);
    ws.addEventListener(
      "message",
      (e) => {
        clearTimeout(timer);
        resolve(String(e.data));
      },
      { once: true },
    );
  });

const [a, b] = await Promise.all([open(), open()]);
const [helloA, helloB] = await Promise.all([nextMessage(a), nextMessage(b)]);
for (const hello of [helloA, helloB]) {
  if (JSON.parse(hello).t !== "hosgeldin") throw new Error(`Beklenmeyen ilk ileti: ${hello}`);
}
const saved = nextMessage(a);
a.send(JSON.stringify({ t: "kaydet" }));
const reply = JSON.parse(await saved) as { t: string };
a.close();
b.close();
if (reply.t !== "kaydedildi") throw new Error(`Beklenmeyen yanıt: ${JSON.stringify(reply)}`);
console.log("NoteRoom tamam: iki bağlantı karşılandı, kaydet yanıtlandı.");

// Oturumsuz bağlantı reddedilmeli (el sıkışma açılmamalı).
const anonOpened = await new Promise<boolean>((resolve) => {
  const ws = new WebSocket(url);
  ws.addEventListener("open", () => {
    ws.close();
    resolve(true);
  });
  ws.addEventListener("error", () => resolve(false));
});
if (anonOpened) throw new Error("Oturumsuz bağlantı kabul edildi");
console.log("Oturumsuz bağlantı reddedildi.");
