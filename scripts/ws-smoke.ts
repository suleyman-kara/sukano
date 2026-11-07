/**
 * NoteRoom duman testi: tohum kullanıcısıyla giriş yapar, bir not odasına iki
 * WebSocket bağlantısı açar ve bir mesajın iki bağlantıya da yayınlandığını doğrular.
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

const url = `${base.replace(/^http/, "ws")}/api/notes/lansman-hazirligi/ws`;

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
const payload = `merhaba ${Date.now()}`;
const received = Promise.all([nextMessage(a), nextMessage(b)]);
a.send(payload);
const [echo, broadcast] = await received;
a.close();
b.close();

if (echo !== payload || broadcast !== payload) {
  throw new Error(`Beklenmeyen yanıt: ${echo} / ${broadcast}`);
}
console.log(`NoteRoom tamam: gönderen ve diğer bağlantı "${payload}" aldı.`);

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
