# Sukano — Ürün ve Teknik Plan

Durum: **Onay bekliyor.** Bu belge, planlama görüşmelerinde verilen tüm kararları tek yerde toplar.
Onaylandıktan sonra sırasıyla tasarım (tüm ekranlar), GitHub issue'ları ve aşamalı uygulama gelir.

---

## 1. Amaç ve ilkeler

Sukano, kişisel notlar ve paylaşılan projeler üzerine kurulu bir web uygulamasıdır.

- **Keep mantığı, kendi görünümü.** Çalışma mantığı Google Keep'ten ilham alır; tasarım birebir kopya değildir, sade ve moderndir.
- **Kartlar sade kalır.** Izgaradaki kartlar ilerleme çubuğu, tarih özeti gibi süsler göstermez.
- **Projede her şey ortaktır.** Proje içindeki not, sıralama, sabitleme, renk, arşiv, çöp ve not düzeyindeki hatırlatıcı projedeki herkes için tektir.
- **Asıl fark yapılacaklar notudur.** Tasarım ve kullanım hissi için en çok emek buraya harcanır.
- **Temiz başlangıç.** Veri taşıma yok. Arayüz dili Türkçe.
- **Her şey özeldir.** Herkese açık paylaşım bağlantısı yok; içerik yalnızca sahibine ve proje üyelerine görünür.

## 2. Temel kavramlar

### Alanlar
- **Ana sayfa (kişisel alan):** Yalnızca kullanıcıya ait notların kart ızgarası.
- **Proje sayfası:** Aynı ızgara mantığı; içerik projedeki herkesle ortak. İstenildiği kadar not içerebilir.
- Her alanın (ana sayfa ve her proje) **kendi arşivi ve kendi çöp kutusu** vardır.

### Not sahipliği
- Bir not **en fazla bir projeye** atanabilir.
- Projeye atanan not kişisel alandan çıkar, **projenin malı** olur, yalnızca proje sayfasında görünür.
- Kişisel notu projeye **taşıma:** yönetici ve düzenleyici yapabilir.
- Proje notu kişisel alana ya da başka projeye **yalnızca kopyalanır**, taşınmaz.
- Proje notunda **kimin oluşturduğu ve kimin son düzenlediği** görünür.

### Roller (proje bazında, yönetici verir)
| Rol | Notlar | Proje yönetimi |
|---|---|---|
| Yönetici | Tam yetki | Ayarlar, davet, rol verme, üye çıkarma, proje silme |
| Düzenleyici | Yönetici ile aynı: oluşturur, düzenler, taşır, kopyalar, arşivler, çöpe atar, geri alır, kalıcı siler, görevleri işaretler | Yok |
| Görüntüleyici | Yalnızca okur ve arar. Kendisine atanmış görevi bile işaretleyemez | Yok |

- Birden fazla yönetici olabilir. Yönetici başka üyeyi yükseltebilir/indirebilir.
- Son yönetici kendini indiremez ve projeden ayrılamaz; ama **projeyi silebilir**.

### Hesap
- Herkes serbestçe hesap açar.
- Giriş: **Google ile** ve **e-posta + şifre**. Bağlantıyla (magic link) giriş yok.
- Aynı e-posta ile Google ve şifreli giriş **aynı hesaba** bağlanır.
- Şifreli kayıtta **e-posta doğrulaması zorunlu**; doğrulanmadan davet alamaz.
- Profil: ad, avatar (Google'dan ya da yüklenir), e-posta değiştirme (yeni adrese doğrulama ile).
- Hesap silme var (basit): kişisel notlar silinir, proje notları kalır ve yazar "silinmiş kullanıcı" görünür; tek yönetici olduğu projeler için önce devir ya da silme istenir.

## 3. Not türleri ve ortak özellikler

### Ortak (her iki tür)
- İsteğe bağlı **başlık**.
- **Renk:** 8–10 sade pastel renk. Proje notunda rengi herkes görür.
- **Sabitleme:** var; projede ortak.
- **Arşiv:** var; alan bazında (ana sayfa / proje).
- **Çöp kutusu:** var; alan bazında; **7 gün** sonra kalıcı silme.
- **Arama:** başlık, metin içeriği ve görev başlıklarında; kişisel alan + erişilen tüm projeler tek sonuç listesinde, kaynağı belirtilir.
- **Sürükleyerek sıralama:** var; projede ortak.
- **Kopyasını oluştur:** var.
- **Hatırlatıcı (not düzeyi):** nota tarih + saat verilir. Proje notunda **projedeki herkese** gider.
- **Sürümler:** her notta (kişisel ve proje, metin ve yapılacaklar). Aynı kişinin 5 dakika içindeki ardışık düzenlemeleri tek sürüm sayılır; son 50 sürüm tutulur; geri yükleme yönetici ve düzenleyiciye (kişisel notta sahibine) açık.
- **Metin ↔ yapılacaklar dönüşümü:** satırlar görev olur, görevler satır olur.
- **Olmayanlar:** çizim, ses notu, etkinlik akışı (geçmiş günlüğü), herkese açık paylaşım.

### Metin notu
- **Hafif biçimlendirme**, Keep seviyesinde: kalın, italik, madde listesi, başlık, bağlantı. Tiptap tabanlı editör, Markdown kısayolları.
- **Dosya ekleme:** yalnızca metin notunda. Görsel ve genel dosya, dosya başına 10 MB, R2 üzerinde.
- **Gerçek zamanlı ortak düzenleme:** iki kişi aynı anda yazabilir, birbirinin imlecini görür, çakışma olmaz (Yjs + Durable Object).

### Yapılacaklar notu (projenin kalbi)

**Yapı**
- Not = isteğe bağlı başlık + görev ağacı. Notun kendisine açıklama alanı yok (Keep gibi).
- Görevler ve **sınırsız derinlikte** alt görevler.
- **İlk açılışta yalnızca üst seviye görünür.** Alt görevi olan satırda ok ve sayı ("3") vardır; oka tıklayınca ya da sağ okla bir seviye açılır. "Tümünü aç / tümünü kapat" kısayolu vardır.
- Açık/kapalı durumu **kişiye özel ve cihaz bazında hatırlanır**.
- Girinti her seviyede daralır; mobilde 3. seviyeden sonra girinti sabitlenir, seviye çizgiyle belli olur.
- Açık not **kaydırılabilir**.

**Izgaradaki kart**
- İlk 5–6 üst seviye görev kutucukla; fazlası "+4 görev daha". Alt görevler ve tamamlananlar kartta görünmez.
- Kart üzerinden kutucuk işaretlenebilir (not açılmadan).

**Görev satırı**
- Varsayılan: **kutucuk + başlık** (başlık tek satır).
- Sağda sessiz ipuçları: alt görev oku ve sayısı, bitiş tarihi ("12 Kas", geçmişse kırmızı), atanan avatar(lar).
- Satırın üstüne gelince ya da imleç satırdayken sağda soluk **takvim** ve (proje notunda) **kişi** simgeleri belirir; tıklayınca küçük seçici açılır. Tarih seçicide hızlı seçenekler: Bugün, Yarın, Gelecek hafta, takvim. Başlığa yazılan hiçbir karakter ("@", "!") özel anlam taşımaz.
- Satıra tıklayınca **akordeon** (satırın hemen altında) açılır: açıklama (hafif biçimlendirmeli), başlangıç tarihi, bitiş tarihi, atanan kişiler (yalnızca proje notunda), "alt görev ekle".
- Tarih zorunlu, **saat isteğe bağlı**. Bitiş tarihi olan göreve "hatırlat" denince tarih+saat hatırlatıcı olur; **yalnızca atananlara** gider (atanan yoksa kurana).
- **Atama:** birden fazla kişiye olabilir; yalnızca proje üyeleri; kişisel notlarda atama yok. Atamayı toplayan ayrı bir görünüm **yok** ("Bana atananlar" kaldırıldı).

**Tamamlama**
- Üst görev işaretlenince tüm alt ağacı tamamlanır.
- Alt görevlerin **hepsi tamamlanınca üst görev kendiliğinden tamamlanır**; bu yukarı doğru zincirleme sürer.
- Tamamlanmış üst görevin bir alt görevi geri açılırsa üstündekiler de geri açılır.
- Tamamlanan görev (alt ağacıyla birlikte) kendi seviyesinin altındaki daraltılabilir **"Tamamlananlar (n)"** grubuna iner, üstü çizili.
- "Tamamlananları sil" komutu + "Geri al". Otomatik silme yok.
- Proje notunda işaretleme: yönetici ve düzenleyici; görüntüleyici hiçbir zaman.

**Klavye akışı**
| Tuş | İş |
|---|---|
| Enter | Altına aynı seviyede yeni görev; başlığın ortasındaysa metni böler |
| Shift+Enter | Detay akordeonunu aç/kapat |
| Tab / Shift+Tab | Girintile / girintiyi azalt (mobilde klavye üstü araç çubuğu) |
| Backspace (boş satır) | Görevi sil, imleç üst satıra |
| Alt+↑ / Alt+↓ | Görevi kardeşleri arasında taşı |
| Ctrl+Enter | Tamamla / geri al |
| Ctrl+D | Tarih seçici (Türkçe doğal yazım: "yarın", "cuma", "15 kasım") |
| Ctrl+Shift+A | Kişi seçici (proje notunda) |
| ↑ / ↓ | Satırlar arasında gezin |
| → / ← | Alt görevleri aç / kapat |
| Ctrl+Z | Not içinde geri al |

**Diğer**
- Sürükleyerek taşıma: not içinde seviyeler arası (başka görevin altına bırakma dahil). Notlar arası yok.
- Ortak düzenleme: her görev ayrı kayıt; aynı başlığı iki kişi aynı anda yazarsa son yazan kazanır.
- **Olmayanlar:** tekrarlayan görev, öncelik, görev etiketi, görev yorumu, dosya ekleme.

## 4. Projeler, davet, üyelik

- Herkes proje açabilir; açan yönetici olur.
- Proje: ad, renk ya da simge (emoji), isteğe bağlı kısa açıklama. Üye listesi ve roller herkese görünür.
- Sol gezinmede proje listesi; sıralama **kişiye özel**, sürükleyerek.
- Proje arşivleme yok.
- **Davet:** yalnızca yönetici gönderir. Kayıtlı kullanıcının e-posta adresi tam yazılır; hesap yoksa "önce hesap açması gerekiyor" denir. Kullanıcı dizininde arama yok. Davette rol seçilir.
- Davet alan: uygulama içi "Davetler" alanı + e-posta bildirimi. Kabul/ret. 14 gün sonra geçersiz. Yönetici geri çekebilir.
- **Ayrılma/çıkarılma:** notlar projede kalır. Kişinin atamaları kaldırılır. "Oluşturan/son düzenleyen" bilgisi adıyla kalır.
- **Proje silme:** 7 gün "silinmiş" bekler, yalnızca yöneticiler görür ve geri alabilir; sonra notlar, dosyalar ve sürümler kalıcı silinir. Üyelere bildirim gider.

## 5. Gerçek zamanlılık, bildirim, hatırlatıcı, çevrimdışı

- **Varlık göstergesi:** açık notun köşesinde notu açık tutanların avatarları.
- **Canlı ızgara:** proje sayfasında not ekleme/sıralama diğerlerine anında yansır.
- **Uygulama içi bildirim** (zil + liste): davet, rol değişikliği, projeden çıkarılma, proje silindi, göreve atanma, hatırlatıcı.
- **Tarayıcı push:** hatırlatıcı, göreve atanma, davet. Ayarlardan her biri kapatılabilir.
- **E-posta:** yalnızca davet, e-posta doğrulama, şifre sıfırlama, e-posta değişikliği.
- **Hatırlatıcı:** bir kez çalar, bildirimde "notu aç". Erteleme ve tekrar yok. Saat dilimi tarayıcıdan, varsayılan Türkiye. Google Calendar entegrasyonu ikinci aşama.
- **Çevrimdışı:** PWA ana ekrana kurulur; son açılan sayfalar önbellekten okunur; internet yokken "çevrimdışısınız" uyarısı, düzenleme kapalı (Keep gibi).

## 6. Teknik mimari

### Yığın
- **React Router v7** (framework modu) + Vite, React, TypeScript
- **Tailwind CSS** + **shadcn/ui** (Radix tabanlı hazır bileşenler)
- **Tiptap** (metin notu, görev açıklaması; Yjs ortak düzenleme)
- **dnd-kit** (kart ve görev sürükleme)
- **Drizzle ORM**
- **Better Auth** (e-posta + şifre, Google, e-posta doğrulama, şifre sıfırlama; D1 + Drizzle)
- **Cloudflare Turnstile** (kayıt formunda görünmez doğrulama)

### Cloudflare bileşenleri
| İhtiyaç | Bileşen |
|---|---|
| Uygulama (sayfalar + API + statik dosyalar) | Workers |
| Veritabanı | D1 (SQLite). 10 kişilik ekip için fazlasıyla yeterli; Drizzle sayesinde ileride Postgres'e geçiş şema değişikliği gerektirmez |
| Dosya ve görsel | R2 (panelden etkinleştirilmeli) |
| Ortak düzenleme, varlık, canlı ızgara | Durable Objects + WebSocket (not başına bir nesne; proje başına bir yayın kanalı) |
| Hatırlatıcı gönderimi, çöp ve silinmiş proje temizliği, süresi dolan davetler | Cron Triggers (dakikada bir) |
| Tarayıcı bildirimi | Web Push (VAPID, WebCrypto ile Worker'dan) |
| E-posta | Resend (ya da Cloudflare Email Service) |
| Hız sınırı | Workers Rate Limiting |

Plan: geliştirme ücretsiz planda, yayına alırken **Workers Paid** (ayda 5 $; CPU süresi 30 s, D1/R2 kotaları büyür).

### Veri modeli (taslak)
- `users`, `accounts`, `sessions`, `verifications` (Better Auth)
- `user_preferences`: tema, proje sıralaması, bildirim tercihleri
- `projects`: ad, simge/renk, açıklama, `deleted_at`
- `project_members`: rol
- `invitations`: e-posta, rol, durum, son geçerlilik
- `notes`: tür (text/todo), `owner_user_id` (kişisel) ya da `project_id` (proje), başlık, renk, sabit, sıra, `archived_at`, `trashed_at`, `created_by`, `updated_by`; metin gövdesi (arama ve kart için HTML/JSON kopyası; canlı Yjs belgesi Durable Object depolamasında)
- `tasks`: `note_id`, `parent_id`, sıra, başlık, açıklama, başlangıç, bitiş (tarih + isteğe bağlı saat), `completed_at`, `completed_by`
- `task_assignees`
- `reminders`: hedef (not ya da görev), zaman, kuran, gönderildi mi
- `attachments`: `note_id`, R2 anahtarı, ad, boyut, tür
- `note_versions`: `note_id`, anlık görüntü (metin ya da görev ağacı), kim, ne zaman
- `notifications`, `push_subscriptions`

### Güvenlik
- Şifre en az 8 karakter; giriş ve kayıt denemelerine hız sınırı; Turnstile.
- Oturum 30 gün. İki adımlı doğrulama yok.
- Her istek proje üyeliği ve rol kontrolünden geçer; dosya indirme imzalı ve yetkili.

### Geliştirme düzeni
- Tek depo, tek uygulama.
- GitHub Actions + Wrangler: `main` → üretim, diğer dallar → önizleme.
- Cloudflare bağdaştırıcısı (MCP) D1, KV, R2 ve Worker listeleme/okuma yapabiliyor; **Worker yayınlama, gizli değişken, Durable Object, cron ve alan adı ayarları bağdaştırıcıda yok.** Bunlar için Cloudflare API anahtarı gerekir (GitHub gizli değişkeni ve/veya bu oturuma güvenli formla verilen anahtar ile Wrangler).

## 7. Ekran envanteri (tasarım aşamasında çizilecek)

Her ekran: masaüstü + mobil, açık + koyu tema.

1. Giriş / Kayıt / E-posta doğrulama / Şifre sıfırlama / Şifremi unuttum
2. Uygulama kabuğu: sol gezinme (Notlar, projeler listesi, Davetler, Arşiv, Çöp, Ayarlar), üst çubuk (arama, zil, profil)
3. Ana sayfa: kart ızgarası, boş durum, "not al" alanı, renk/sabit/arşiv kart eylemleri
4. Metin notu açık hali: editör, biçimlendirme çubuğu, dosya ekleri, renk, hatırlatıcı, sürümler, varlık avatarları
5. Yapılacaklar notu açık hali: görev ağacı, satır ipuçları, akordeon detay, tarih seçici, kişi seçici, tamamlananlar grubu, mobil klavye üstü araç çubuğu, sürükleme halleri
6. Arama sonuçları
7. Arşiv ve Çöp (alan bazında)
8. Proje sayfası: başlık, üyeler, ızgara; proje oluşturma/düzenleme
9. Proje ayarları: üyeler ve roller, davet gönderme, proje silme / geri alma
10. Davetler (gelen davetler, kabul/ret)
11. Bildirimler listesi, bildirim ayarları
12. Not taşıma / kopyalama diyaloğu
13. Sürüm geçmişi görünümü
14. Ayarlar: profil, tema, e-posta değiştirme, şifre, hesap silme
15. PWA kurulum ipucu, çevrimdışı uyarısı, hata ve boş durumlar

## 8. Aşamalar (her biri çalışır ve yayınlanabilir)

1. İskelet, tasarım sistemi, giriş (e-posta + şifre, Google, doğrulama, sıfırlama, Turnstile), kişisel metin notları ızgarası, renk, sabitleme, arşiv, çöp, arama, sıralama, sürümler (temel)
2. Yapılacaklar notu (klavye akışı, derinlik, tamamlanma, sürükleme, tarih/kişi seçici) ve metin ↔ yapılacaklar dönüşümü
3. Projeler, roller, davet, taşıma ve kopyalama, oluşturan / son düzenleyen bilgisi, proje silme bekleme süresi
4. Gerçek zamanlı ortak düzenleme, varlık göstergesi, canlı ızgara
5. Dosya ekleme, hatırlatıcılar, push ve uygulama içi bildirimler
6. PWA, mobil cilalama, hesap silme, son kontroller

Her aşamanın sonunda çalışan önizleme + kısa özet, onaydan sonra sıradaki aşama.

## 9. Açık konular
- Tasarım yönü (yazı tipi, vurgu rengi, yoğunluk) tasarım aşamasında belirlenecek.
- E-posta gönderim servisi seçimi (Resend varsayılan) ve gönderici alan adı.
- Alan adı.
- Google OAuth istemci kimliği (Google Cloud Console'da oluşturulacak).

---

## 10. Tasarım kararları (onaylandı, 7 Kasım 2026)

Tasarım tuvali: https://claude.ai/artifact/UeHrCw2oY651GfEmHzFCBF (76 artboard; masaüstü 1440, tablet 834×1194, mobil 390×844; açık ve koyu tema). Kaynak dosyalar `docs/design/` altında (`*.dc.html` + `canvas.json`); inceleme raporları `docs/design/ux-1.md`, `ux-2.md`, `consistency.md`.

### Görsel dil
- **Yazı tipi:** Onest (400/500/600/700), yedek Inter ve sistem. Gövde 14 px masaüstü, 15–16 px mobil.
- **Renk:** vurgu çam yeşili `#2E6B55` (koyu temada `#7FC2A6`); sıcak gri nötrler (`--bg #F7F6F2`, `--surface #FFF`, `--fg #1C1B19`, `--muted #5F5D57`, `--line #E4E2DC`; koyu: `#141413 / #1E1E1C / #ECEAE4 / #AFADA6 / #2F2F2C`). Not renkleri 9 pastel + varsayılan, koyu temada derin tonları. Proje renkleri 7 koyu ton (`#AD5A34 #3F6DB5 #4A7D45 #9E4F72 #6F5DAE #87691A #4F6C7A`); avatar renkleri beyaz metinle ≥ 4,5:1.
- **Logo:** 2×2 yuvarlatılmış kare ızgara (sol üst ve sağ alt tam renk, diğer ikisi %35); kelime işareti küçük harf "sukano", 700, -0.01em. PWA simgesi yeşil zemin üstünde beyaz kareler.
- Radius 10–14 (kart 14, düğme 10, mobil kart 12), Keep gibi havadar.

### Kabuk ve gezinme
- Sol panel katlanabilir: 248 px açık / 72 px ray (yalnızca simgeler, projeler baş harfli daire). Tablette varsayılan ray, hamburger ile kaplama. Mobilde çekmece.
- "Notlar · Arşiv · Çöp" görünüm kapsülü üst çubukta, aramanın sağında; yalnızca alan sayfalarında (Notlarım, proje). Masaüstünde hepsi etiketli, tablette yalnızca seçili etiketli, mobilde yalnızca simge.
- Avatar menüsü: ad, e-posta, Ayarlar, Çıkış yap (masaüstü ve tablet); mobilde Ayarlar sayfasında.
- Silinmiş projeler listesi sol menüde Projeler'in altında (yalnızca yöneticilere).

### Yapılacaklar notu
- Satır: kutucuk + başlık; sağda sessiz ipuçları (alt görev "1/3", tarih "3 → 12 Kas" / "Bugün" / gecikmiş kırmızı, avatarlar). Hover/odakta takvim ve kişi simgeleri; "Ayrıntılar" satırlar simgesi akordeonu açar.
- Tarih seçici: iki yuva ve ok (başlangıç → bitiş; sözcük yok), varsayılan aktif yuva bitiş; hızlı seçenekler; doğal yazım alanı ("yarın, cuma, 15 kasım"); takvimde aralık vurgusu; saat düğmesi; Hatırlat anahtarı ("Atananlara gider" / "Sana gider"); "Tarihleri temizle".
- Tamamlama: satır 1,2 sn yerinde kalır, sonra "Tamamlananlar (n)" grubuna iner; not içinde toast "X tamamlandı · Geri al" (8 sn, üzerine gelince durur, en çok 2 yığın); Ctrl+Z son tamamlamayı geri alır. Zincirleme tamamlanmada üst görev adı toast'ta yazar.
- Kısayollar: sürekli şerit yok; boş satırın yer tutucusu "Görev yaz · Enter yeni görev · Tab alt görev"; Ctrl+/ ve alt çubuktaki klavye simgesi kısayol kartını açar. Ctrl+D seçiciyi açıp odağı doğal yazım alanına verir; Esc katmanlı kapatır.
- Dokunmatik: klavye üstü araç çubuğu (girinti, alt görev, tarih, kişi, ayrıntılar, Tamamla, Bitti); görev ayrıntısı alttan açılan sayfa.

### Sözlük
- "Kopyasını oluştur" (aynı alanda yinele), "Kopyala…" (proje notunu başka alana kopyala), "Taşı veya kopyala…" (kişisel not; taşıma 10 sn geri alınabilir, sonra kesin).
- "Geri yükle" (çöp ve sürüm), "Projeyi geri getir" (silinmiş proje), "Geri al" (toast ve Ctrl+Z), "Tarihleri temizle" (görev tarihi), "Kaldır" (hatırlatıcı, ek).
- "Not hatırlatıcısı" (not düzeyi), "Hatırlat" (görev). Rol adları çipte büyük, cümle içinde küçük harf. Görüntüleyici açıklaması: "Okur ve arar; not ekleyemez, görev işaretleyemez."
- Kart ve not menüsü kanonik sırası: Sabitle · Renk · Not hatırlatıcısı · Taşı veya kopyala… · Kopyasını oluştur · Sürüm geçmişi · Dönüştür · ayraç · Arşivle · Çöpe at (yapılacaklarda en üstte Tümünü aç/kapat ve Tamamlananları sil).

### Diğer ürün kararları (tasarım sırasında alındı)
- Görüntüleyici: satırlarda kutucuk yerine madde işareti; kilitli rozet. Görev görüntüleyiciye atanabilir ama işaretleyemez.
- Mobil alttan açılan sayfalar: anında uygulananlarda "Bitti", onaylılarda Vazgeç + birincil; tutamak ve karartma erişilebilir düğme; geri hareketi kapatır.
- Toast sol altta (uygulama) / not içinde (yapılacaklar), 6–8 sn, "Geri al". Arşivle, çöpe at, taşı, tamamla, tamamlananları sil geri alınabilir.
- E-posta değiştirirken şifre istenir; hesap silmede e-posta adresi yazılarak onaylanır. Eki olan metin notu önce ekler kaldırılmadan yapılacaklara dönüştürülemez.
- Turnstile görünmez; formda yalnızca "Bu form Cloudflare Turnstile ile korunur." satırı.
- Arşivde tüm görevleri tamamlanmış yapılacaklar kartı başlık + "Tüm görevler tamamlandı" satırı gösterir.
- PWA kurulum ipucu: Android/masaüstünde "Ekle"; iOS'ta "Paylaş → Ana Ekrana Ekle" adımları.
- Sürüm geçmişinde önizleme paneli; geri yükleme onaylı.

### Hareket
- Giriş ekranı arka planı: A "Yükselen ızgara" (2×2 kare matrisleri, 5–11 sn döngü, yalnızca transform ve opacity; üretimde genlik önizlemenin yaklaşık yarısı). `prefers-reduced-motion` ve Ayarlar'daki "Hareketi azalt" seçeneğine uyulur.
- Süre ölçeği: micro 120, small 180, medium 240, large 320 ms, ambient 8–14 s; giriş ease-out-quart, çıkış ease-in-quart, spring hissi `cubic-bezier(.2,.8,.2,1)`.
- Kütüphane: Motion (`motion/react`), yalnızca çıkış animasyonları (`AnimatePresence`), paylaşılan geçişler (`layout`/`layoutId`) ve `MotionConfig reducedMotion="user"` için; geri kalanı düz CSS.

---

## 11. Test stratejisi (onaylandı, 7 Kasım 2026)

Dört katman; her özellik kendi katmanlarında testlerle birlikte gelir, testler geçmeden önizleme yayınlanmaz.

| Katman | Araç | Kapsam | Ne zaman |
|---|---|---|---|
| Birim | Vitest | Saf mantık: görev ağacı işlemleri (girinti, taşıma, zincirleme tamamlanma/geri açma), tarih çözümleme ve aralık metni, yetki kuralları (rol × eylem), hatırlatıcı alıcı kuralı, sözlük yardımcıları | **Önce test** (TDD); prototipteki senaryolar taşınır |
| Bileşen | Vitest + Testing Library (jsdom) | Yapılacaklar notu klavye akışı, tarih seçici, toast ve geri al, kısayol kartı, sol panel, görünüm kapsülü | Özellikle birlikte |
| Worker / API | Vitest `@cloudflare/vitest-pool-workers` (Miniflare, yerel D1) | Kimlik doğrulama, her uç noktada yetki kontrolü (TDD), taşıma/kopyalama, çöp ve silinmiş proje temizliği, cron, Durable Object mesajlaşması | Yetki için önce test; diğerleri özellikle birlikte |
| Uçtan uca | Playwright (+ axe-core) | Kritik akışlar üç görünümde (1440 / 834 / 390): kayıt ve giriş, not oluşturma, yapılacaklar klavye akışı, projeye taşıma, davet ve kabul, iki tarayıcıda gerçek zamanlı düzenleme, hatırlatıcı bildirimi | Her aşama issue'sunun kabul ölçütü |

- **CI:** her push'ta typecheck + lint + birim + bileşen (hedef 1–2 dk); PR'da Worker testleri + uçtan uca duman seti (5–8 dk); `main`'de tam uçtan uca. Kapsam eşiği yalnızca mantık modüllerinde %85.
- **Test hesapları ve tohum verisi:** `ayse@test.sukano`, `mehmet@test.sukano`, `zeynep@test.sukano`, `can@test.sukano`, `suleyman@test.sukano` (tasarımdaki örnek veri: Web Sitesi Yenileme projesi, Lansman hazırlığı notu vb.); tohum betiği hem testlerde hem geliştirmede kullanılır.
- Google girişi uçtan uca test edilmez (e-posta + şifre ile test kullanıcıları); e-posta gönderimi testte sahte servise gider; Turnstile test anahtarlarıyla geçer.
- Test adları Türkçe, davranış cümlesi olarak ("alt görevlerin hepsi tamamlanınca üst görev kendiliğinden tamamlanır").
- Görsel regresyon ilk sürümde yok.
