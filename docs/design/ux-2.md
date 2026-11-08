# Sukano: ikinci kullanılabilirlik (UX) değerlendirmesi

Kapsam: canvas.json'daki 69 artboard (masaüstü, T* tablet, M* mobil), PLAN.md, ilk UX raporu ve tutarlılık raporu. Ekran görüntüleri `fix-desk/shots/after`, `fix-tab/shots`, `fix-mob/shots/final` ve `fix-mob/shots/rv` (MMoveB, MConfirm1) klasörlerinden okundu. TodoNote'un davranışı `data-dc-script` kodundan değerlendirildi. Toast hâli ayrıca render edildi: `review/ux2/tool/shots/toast/TodoNote.{light,dark}.png`. Tasarım dosyalarına dokunulmadı.

---

## 1. Genel değerlendirme

**Puan: 8 / 10** (ilk tur: 7 / 10).

İlk turdaki sekiz yüksek bulgunun altısı tasarım düzeyinde gerçekten çözülmüş:
- **Klavye tuzağı kalktı.** Esc odağı "Görev ekle"ye taşıyor, sonraki Tab araç çubuğuna gidiyor. Shift+Enter odağı açıklamaya götürüyor, Esc onu satıra geri getiriyor. Ctrl+Enter'dan sonra odak görünür bir sonraki satıra geçiyor; geri al da odağı ilk açılan satıra döndürüyor.
- **Tamamlanan satır hemen kaybolmuyor.** 1,2 sn yerinde, üstü çizili kalıyor; sonra "Tasarım onayı da tamamlandı · Geri al" toast'ı çıkıyor. "da/de" ünlü uyumu bile doğru.
- **Kişi seçici düzeldi.** En üstte "Süleyman Kara (sen)" var. Görüntüleyici "görüntüleyici · işaretleyemez" etiketiyle soluk gösteriliyor.
- **Hatırlatıcı alıcıları yazıyor.** "Projedeki herkese gider · 5 üye" (avatarlarla), görevde "Atananlara gider / Sana gider".
- **"İki ok" sorunu çözüldü.** Ayrıntı düğmesi artık ≡ simgesi; ipucu "1/3", kısayol kartında da açıklanıyor.
- **Geri al ile geri yükle ayrıldı.** "Geri al" (toast), "Geri yükle" (çöp, sürüm), "Projeyi geri getir" (silinmiş proje) her yerde tutarlı.

Tablet ve mobil eklemeleri (bottom sheet seçiciler, MMove'un iki hâli, MConfirm, MViewer, MInstall, MOffline) akışların çoğunu kapatıyor. Rail'deki proje harflerinin kontrastı artık 4,8–5,2:1 aralığında.

Puanı 8'de tutan şeyler şunlar:
1. Yeni eklenen geri al katmanı klavye ve ekran okuyucu kullanıcısına ulaşmıyor.
2. Mobil sheet'lerin kapanma ve kaydetme modeli tutarsız; bir kısmının erişilebilir bir kapatma yolu yok.
3. Dokunmatikte görev ayrıntısı (akordeon) hiç çizilmemiş.
4. Not eylemlerinin simgesi ve yeri, not türüne ve cihaza göre değişiyor.
5. Görüntüleyicinin "soluk" gösterimi fark edilmiyor.

Bunların hiçbiri mimari değil. Hepsi bir iki artboard ve birkaç kural ile kapanır.

---

## 2. Yüksek

### Y1. Geri al toast'ı klavyeyle ve ekran okuyucuyla kullanılamıyor; açık notta gözden uzakta çıkıyor
- **Sorun:**
  - TodoNote'ta toast, not diyaloğunun (`role="dialog"`) DOM'da **dışında** ve ekranın sol altında (`left:24px; bottom:24px`) duruyor. Render edilen görüntüde toast, ortadaki notun 350 px solunda, kenar çubuğundaki "Davetler"in üstüne biniyor.
  - Klavye kullanıcısı Ctrl+Enter ile görev tamamladığında odak listede kalıyor. Toast'taki "Geri al"a ulaşmak için Esc → "Görev ekle" → Tab × 9 (araç çubuğu) → diyalog dışı gerekiyor; bunun 6 sn içinde yapılması pratikte imkânsız.
  - Not diyaloğuna ilk turda istenen odak hapsi (`aria-modal`) eklendiğinde toast hiç erişilemez olacak.
  - Kısayol kartında "Ctrl+Z · Geri al" yazıyor, ama prototipte Ctrl+Z yok.
  - Toast 6 sn sonra kapanıyor; hover ya da odakta durmuyor (WCAG 2.2.1).
  - Forms'taki kural "yenisi eskisinin yerini alır" diyor. İki notu art arda arşivleyen kullanıcı ilkinin geri alınma şansını sessizce kaybediyor.
  - Tekil tamamlamada metin yalnızca "Tamamlandı"; neyin tamamlandığı söylenmiyor.
- **Neden önemli:** İlk turun Y2/Y6 çözümü tam bu toast. Görmeyen ve ulaşamayan kullanıcı için zincirleme tamamlama yine "görev kayboldu" deneyimi demek. Sezgiseller: görünürlük, kontrol ve özgürlük; erişilebilirlik.
- **Çözüm:**
  - (a) Not açıkken toast, diyaloğun **içinde**, alt araç çubuğunun hemen üstünde çıksın. Izgarada sol altta kalabilir.
  - (b) Toast görünürken odak hangi satırda olursa olsun Ctrl+Z son toast işlemini geri alsın; toast metnine "Ctrl+Z" ipucu eklensin.
  - (c) Toast hover, odak ve sayfa görünmezken dursun. Süre 8–10 sn olsun; ekran okuyucu etkinse daha uzun.
  - (d) Yeni toast geldiğinde önceki işlem geri alınabilir kalsın: ya kısa bir kuyruk olsun ya da "2 işlem · Geri al" biçiminde birleştirilsin.
  - (e) Tekil metin görev adını içersin: "'SEO kontrolleri' tamamlandı".
  - (f) `role="status"` bölgesi sayfada hep bulunsun, içerik ona yazılsın; koşullu eklenen canlı bölge çoğu okuyucuda duyurulmaz.
- **Artboard:** TodoNote, TodoDark, Forms (toast kalıbı), MStates, MTodo, TTodo.

### Y2. Mobil bottom sheet'lerin kapanma ve kaydetme modeli tutarsız; bazılarının erişilebilir kapatma yolu yok
- **Sorun:** Dokuz sheet var ve üç farklı model kullanılıyor:
  - **× düğmeli:** MMove, MVersions.
  - **Vazgeç/Kaydet düğmeli:** MReminder, MConfirm.
  - **Hiç düğme yok, yalnızca tutamak ve karartma:** MTodoDate, MTodoWho, MNoteMenu, MTodoMenu. Hem `.scrim` hem `.grab` `aria-hidden`, tutamak etkileşimsiz bir `div`. VoiceOver ya da TalkBack kullanıcısı bu dört sheet'ten çıkamaz.

  Ayrıca MTodoDate seçimi anında uyguluyor, MReminder "Kaydet" istiyor. Kullanıcı, hemen hemen aynı görünen iki takvim sheet'inde farklı davranışla karşılaşıyor. Başlangıç→bitiş aralığı seçen kullanıcı ne zaman "bittiğini" bilemiyor.
- **Neden önemli:** Bunlar mobilde yapılacaklar düzenlemenin ana seçicileri. Sezgiseller: tutarlılık, kontrol; WCAG 2.1.1 ve 4.1.2.
- **Çözüm:** Tek kural konsun.
  - **Anında uygulanan seçiciler** (tarih, kişi, menüler): başlık satırında sağda "Bitti" metin düğmesi olsun. Menülerde Bitti yerine görünmez ama odaklanabilir bir "Kapat" düğmesi yeterli.
  - **Onaylı sheet'ler** (hatırlatıcı, taşı/kopyala, onay): altta Vazgeç + birincil eylem; × kaldırılsın (MMove ve MVersions'ta hem × hem Vazgeç/Kapat var).
  - **Hepsinde ortak:** tutamak `button` olsun ("Kapat"), aşağı kaydırma ve karartmaya dokunma kapatsın, Android geri tuşu yalnızca sheet'i kapatsın. Kapanınca odak tetikleyen düğmeye dönsün.
- **Artboard:** MTodoDate, MTodoWho, MNoteMenu, MTodoMenu, MReminder, MMove, MVersions, MConfirm.

### Y3. Dokunmatikte görev ayrıntısı (akordeon) ve görev silme çizilmemiş
- **Sorun:**
  - MTodo ve TTodo araç çubuğunda "Ayrıntılar" (≡) düğmesi var, ama açık hâli hiçbir mobil ya da tablet artboard'unda yok. Plandaki açıklama, başlangıç tarihi ve "Alt görev ekle" yalnızca masaüstünde (TodoNote) çizili.
  - Mobil araç çubuğunda görevi silme yok; tek yol boş satırda Backspace. Yazılı bir görevi silmek için önce metni harf harf silmek gerekiyor.
  - Klavyeyi kapatma düğmesi yok (ilk tur Y8'in bu kısmı açık kaldı). "Tamamla"nın metin etiketi olması karışıklığı azaltmış, ama klavye kapatılmadan görev ağacının altı görülemiyor.
  - Araç düğmeleri hâlâ 40 px (`.kbtn`).
- **Neden önemli:** Planın "mobilde yapılacaklar düzenleme" hedefinin yarısı bu akordeonda. Çizilmezse uygulamada doğaçlanır ve masaüstüyle zihinsel model kopar. Sezgiseller: tutarlılık, kullanıcı kontrolü.
- **Çözüm:**
  - MTodoDetail ve TTodo-ayrıntı hâli çizilsin: satırın altında açılan bölüm (mobilde 3. seviyeden sonra girinti sabit); açıklama alanı; tarih ve kişi çipleri (dokununca MTodoDate/MTodoWho sheet'i); "Alt görev ekle"; en altta "Görevi sil" (kırmızı metin, toast + Geri al).
  - Araç çubuğunun en sağına klavye kapatma simgesi gelsin, "Tamamla" onun soluna. Düğmeler 44 px olsun; 8 düğme 390 px'e sığmıyorsa ↑/↓ taşıma sürüklemeye bırakılabilir.
- **Artboard:** MTodo, TTodo (yeni: MTodoDetail, TTodo ayrıntı hâli).

### Y4. Aynı simge farklı eylem; not eylemlerinin yeri türe ve cihaza göre değişiyor
- **Sorun:**
  - **Kopya simgesi** (iki kare) TextNote alt çubuğunda "Kopyasını oluştur" (aynı alanda yinele) anlamında. TodoNote ve TTodo alt çubuğunda **aynı simge, aynı konumda** "Kopyala…" (başka alana, diyalog açar) anlamında. Forms'taki "Diğer" menüsü ve MTodoMenu ise "Kopyala…" için dışarı-ok simgesi kullanıyor. Aynı ekranda (TodoNote) "Kopyala…" hem çubukta kopya simgesiyle hem Diğer menüsünde dışarı-ok simgesiyle iki kez yer alıyor. "Klavye kısayolları" da hem çubukta hem menüde.
  - **"Yapılacaklar notuna dönüştür"** masaüstü ve tablet metin notunda biçimlendirme çubuğunda yalnızca ☑ simgesi olarak duruyor. Aynı ☑, "Not al" alanında ve Composer'da "Yeni yapılacaklar notu" anlamına geliyor. Biçimlendirme grubunun içinde olduğu için "işaretli liste ekle" diye okunacak, oysa bütün notu dönüştürüyor (onay diyaloğu var, ama beklenti yanlış kuruluyor). Mobilde aynı eylem ⋮ menüsünde metinle duruyor.
  - **TText**'te "Kopyasını oluştur" hiç yok (TextNote'ta var); kart menüsünden ulaşılabiliyor ama not açıkken ulaşılamıyor.
  - **Menü sırası:** MTodoMenu ve Forms'taki yapılacaklar menüsü kanonik sırayı (… Kopyala… · Kopyasını oluştur · Sürüm geçmişi · Dönüştür) bozuyor: Kopyasını oluştur → Dönüştür → Sürüm geçmişi → Kopyala…. MNoteMenu ve THome kart menüsü doğru sırada.
- **Neden önemli:** İlk turun Y5'i tam bu ayrımdı. Etiketler düzelmiş, ama simge katmanı aynı karışıklığı geri getiriyor. Masaüstünde araç çubuğu yalnızca simge olduğundan kullanıcı simgeye güvenir. Sezgiseller: tutarlılık, tanıma > hatırlama.
- **Çözüm:**
  - Simge sözlüğü sabitlensin: iki kare = yalnızca **Kopyasını oluştur**; klasör+ok = **Projeye taşı / kopyala…** (kişisel); dışarı-ok = **Kopyala…** (proje notu). TodoNote ve TTodo çubuğundaki simge dışarı-oka çevrilsin, Diğer menüsündeki tekrarı kaldırılsın.
  - Dönüştür biçimlendirme çubuğundan çıkarılıp metin notunun "Diğer" (⋮) menüsüne alınsın; masaüstü ve tablet metin notuna, TodoNote'taki gibi, bir ⋮ menüsü eklensin.
  - Yapılacaklar menüleri MNoteMenu sırasına çekilsin.
- **Artboard:** TextNote, TText, TodoNote, TodoDark, TTodo, Forms, MTodoMenu, Composer.

### Y5. Görüntüleyici gösterimi anlaşılmıyor; salt okunur not tablet ve mobilde yok
- **Sorun:**
  - MViewer ve TViewer'da kutucuklar yalnızca `opacity:.6`. Ekran görüntüsünde normal kutucuktan ayırt edilmiyor. States'teki "salt okunur not" kutucukları da tamamen normal görünüyor.
  - Dokununca ne olacağı tanımlı değil: sessizce hiçbir şey olmaması "bozuk" algısı yaratır.
  - MViewer kartları düzenlenebilir MTodo ve MText'e bağlanıyor; salt okunur not ekranı tablet ve mobilde çizilmemiş (masaüstünde States'te kaba bir taslak var).
  - Aynı kural dört farklı cümleyle yazılmış:
    - States: "Bu projede görüntüleyicisin: okur ve ararsın…(sana atananlar dahil)"
    - States2: "Okur ve ararsın;…"
    - MViewer ve TViewer: "Okuyabilir ve arayabilirsin;…"
    - ProjectSettings: "Görüntüleyici: okur ve arar…(görev atanabilir)"
- **Neden önemli:** Plan, görüntüleyicinin kendisine atanan görevi bile işaretleyemeyeceğini söylüyor. Bu kuralı en çok "bana atanmış ama işaretleyemiyorum" anında yaşayacak. Sezgiseller: görünürlük, hata önleme, tutarlılık.
- **Çözüm:**
  - Görüntüleyicide kutucuk yerine etkileşimsiz bir işaret kullanılsın (dolgusuz daire ya da noktalı çerçeve; tamamlananlar için ✓ simgesi). Dokunulunca kısa bir toast çıksın: "Görüntüleyiciler görev işaretleyemez · Yöneticiden rol iste".
  - Salt okunur not M ve T için çizilsin: araç çubuğu yok, yalnızca ⋮ içinde (izin verilirse) "Kopyala…", üstte kilitli bant.
  - Tek kök cümle seçilsin: "Okuyabilir ve arayabilirsin; not ekleyemez, görev işaretleyemezsin."
- **Artboard:** MViewer, TViewer, States, States2, ProjectSettings (yeni: MViewerNote / TViewerNote).

---

## 3. Orta

1. **Not diyaloğu yükseklik değiştiriyor.** TodoNote içerik kadar uzayıp kısalıyor. Toast hâlinde tamamlanan satırlar gruba inince diyalog 640 px'ten 440 px'e düşüyor, alt çubuk ve "Kapat" fare imlecinin altından kayıyor. → Not açıkken diyaloğun yüksekliği o oturumda yalnızca büyüyebilsin (min-height = açılış yüksekliği); içerik kaydırılsın. *(TodoNote, TTodo)*
2. **Masaüstü not diyaloğunda klavye kalan işleri.** `aria-modal` ve odak hapsi hâlâ yok. Esc, liste dışındayken notu kapatmıyor (Esc'in "Görev ekle"de karşılığı yok). `.ttl:focus{outline:0}` duruyor; odak, hover ile aynı zemin rengiyle belli oluyor. Masaüstünde kutucuk aria-label'ı hâlâ genel ("Tamamlandı olarak işaretle"); mobilde ise doğru ("Görevi tamamla: Mobil görünüm"). Kısayol kartında "Listeden çık (araç çubuğuna)" yazıyor, ama odak "Görev ekle"ye gidiyor. → Odaklı satıra 2 px sol vurgu çizgisi eklensin. Esc'in üçüncü basışı notu kapatsın (kaydedildiği için güvenli). Etiketler görev adını içersin. Kart metni "Listeden çık" olsun. *(TodoNote, TodoDark, TTodo)*
3. **Ctrl+D odağı yanlış alana gidiyor.** Odak "Bitiş" yuvasına düşüyor; "yarın" yazmak için iki Tab gerekiyor. Doğal yazımla Enter tarihi uyguluyor ama seçici açık kalıyor ve odak alanda bekliyor. → Ctrl+D doğrudan doğal yazım alanına odaklansın; Enter tarihi uygulayıp seçiciyi kapatsın ve satıra dönsün (aralık seçen için Tab ile yuvalar kalsın). *(TodoNote)*
4. **Taşıma kesin ve geri alınamaz.** "Taşıma geri alınamaz" uyarısı iyi, ama yanlış projeye taşıma (özel notun ekibe açılması) için hiçbir emniyet yok. Taşıma toast'ı yalnızca "Projeye git" sunuyor. → 10 sn'lik "Geri al" verilsin (sunucuda kısa bir bekleme penceresi; plan kuralını bozmaz, yalnızca işlem anındaki hatayı karşılar). Olmayacaksa uyarı metni toast'ta da tekrarlansın. *(Forms, Dialogs, TDialogs, MMove)*
5. **Kişisel not "Kopyala" sekmesinde varsayılan hedef "Kişisel alanım".** Bu, "Kopyasını oluştur" ile aynı işi yapıyor ve ikinci bir yol yaratıyor. Taşı sekmesindeki "Notun bir kopyasını kişisel alanda tutmak istersen önce Kopyala sekmesini kullan" cümlesi, iki adımlı bir iş (önce kopyala, sonra taşı) önerir gibi okunuyor. Aynı paneldeki "Projedeki herkes notu görür ve düzenleyebilir" görüntüleyiciler için yanlış. → Kişisel notun Kopyala sekmesinde yalnız projeler listelensin, varsayılan ilk proje olsun. Cümleler şöyle değişsin: "Asıl notun kişisel alanında kalsın istiyorsan Kopyala'yı seç." ve "Projedeki herkes notu görür; yöneticiler ve düzenleyiciler düzenleyebilir." *(Dialogs, TDialogs, MMove)*
6. **Tablet tarih seçicisi ekran klavyesiyle çakışacak.** TTodo'da seçici 570 px'lik bir açılır pencere ve iki araç çubuğunun üstüne biniyor. iPad dikeyde klavye (~400 px) açıkken 1194 px'in kalanına sığmaz. → Tablette dikey yönde seçici, mobildeki gibi sheet olsun; yatay yönde açılır pencere kalsın. Klavye açıkken iki araç çubuğu tek satıra insin (not çubuğu gizlensin). *(TTodo)*
7. **Mobil ve tablette toast'ın klavye ile yeri tanımsız.** MStates'te toast "Not al" çubuğunun üstünde duruyor. MTodo'da klavye ve araç çubuğu açıkken "Tamamla" sonrası toast'ın nerede çıkacağı çizilmemiş. → Toast araç çubuğunun hemen üstüne (visualViewport'a göre) yerleşsin; MTodo için bir "tamamlandı + Geri al" hâli çizilsin. *(MTodo, MStates, TTodo)*
8. **Çıkış yapmanın yeri cihaza göre değişiyor; tablette hiç yok.** Masaüstünde çıkış avatar menüsünde (Main), Ayarlar sayfasında değil. Mobilde avatar Ayarlar'a gidiyor, çıkış Ayarlar'ın altında. Tablette avatar "Hesap menüsü" düğmesi ama menü çizilmemiş, TSettings'te de Çıkış yok. → Kural şu olsun: avatar = hesap menüsü (ad, e-posta, Ayarlar, Çıkış yap) her cihazda; ayrıca Ayarlar sayfasının en altında "Çıkış yap" her cihazda bulunsun. Tablet için hesap menüsü çizilsin. *(Main, Settings, THome, TSettings, MHome, MSettings)*
9. **Mobilde proje ayarları ve davet gizli.** Masaüstü ve tablette proje başlığında avatarlar + "Davet gönder" + dişli var. MProject'te yalnızca avatar yığını var (aria "Üyeler ve proje ayarları"), görünür bir ipucu yok. Yöneticinin en sık yapacağı işlerden biri olan davet mobilde iki katman derinde. → MProject başlık satırına 44 px'lik bir dişli ya da "+ Davet" çipi eklensin (yalnızca yöneticide). *(MProject)*
10. **Mobil ayarlarda "Kaydet" kapsamı belirsiz.** MProjectSettings'te "Kaydet" sayfa başlığında duruyor; kullanıcı rol değişikliklerinin de bu düğmeyi beklediğini sanabilir. Masaüstünde "Kaydet" yalnızca "Genel" kartının içinde. → Mobilde de "Kaydet" Genel kartının altına alınsın; rol değişiklikleri anında uygulanıp toast ile onaylansın. *(MProjectSettings, TProjectSettings)*
11. **Mobilde arşivden çıkarma yolu yok.** MArchive kartlarında ⋮ yok (MTrash'te var). Arşivlenmiş notun açık hâli de hiçbir cihazda çizilmemiş: üstte "Arşivde" bandı + "Arşivden çıkar". → MArchive kartlarına MTrash'teki gibi ⋮ (Arşivden çıkar, Çöpe at) eklensin; açık arşiv notu için bir bant tanımlansın. *(MArchive, Archive, TArchive)*
12. **Sürüm önizlemesi hâlâ yalnızca metinle anlatılıyor.** "Eklenen görevler yeşil, silinenler üstü çizili" deniyor, ama önizleme hâli ve önizlemeden çıkış hiçbir cihazda çizilmemiş (ilk tur O7'nin yarısı). → Bir artboard çizilsin: seçilen sürüm notun yerinde salt okunur gösterilsin, üstte "3 Kas, 16:12 sürümünü görüyorsun · Şu ana dön · Geri yükle" bandı olsun. *(Dialogs, TDialogs, MVersions)*
13. **PWA ipucu iOS'ta işe yaramaz ve zamanlaması belirsiz.** MInstall, TStates ve States tek bir "Ekle" düğmesi gösteriyor. iOS Safari programatik kurulum sunmaz (Paylaş → Ana Ekrana Ekle). İpucu ana sayfada, kartların üstüne binerek çıkıyor; × kalıcı mı kapatıyor, belli değil. → iOS için adım adım bir varyant çizilsin (Paylaş simgesiyle). İpucu ilk hatırlatıcı kurulduğunda ya da üçüncü ziyarette çıksın. × yerine "Şimdi değil" kullanılsın ve 30 gün sonra tekrar sorulsun. *(MInstall, TStates, States)*
14. **Çevrimdışı akışın uçları eksik.** Bant ve "Son eşitleme" iyi. Ama çevrimdışıyken açılan not, karttaki kutucuğa dokunma (MOffline'da kutucuklar etkin görünüyor) ve "Yeniden bağlandı" kapanışı çizilmemiş. → Kutucuklar soluk ve etkileşimsiz gösterilsin; dokunulunca "Çevrimdışıyken düzenlenemez" toast'ı çıksın; bağlantı dönünce bant 3 sn "Yeniden bağlandı" göstersin. *(MOffline, States, TStates)*

---

## 4. Küçük

- **"Projeye taşı / kopyala…" etiketi.** Menülerde sığıyor (THome 260 px menüde tek satır), ama eğik çizgi teknik görünüyor. "Taşı veya kopyala…" daha kısa ve doğal. Masaüstü kart hover çubuğunda yalnızca simge olduğu için tooltip de aynı metni kullanmalı.
- **Ctrl+Enter sonrası yeni toast.** Önceki toast'ın Geri al'ını iptal ediyor ama metni değiştiriyor. "Tamamlandı" yazan iki toast art arda gelince kullanıcı değişikliği fark etmiyor. Y1(e) bunu da çözer.
- **"?" hâlâ boş görev başlığında kısayol kartını açıyor.** Bu, "başlıkta hiçbir karakter özel anlam taşımaz" kuralıyla çelişiyor. Yalnızca Ctrl+/ kullanılsın. *(TodoNote)*
- **Enter kenar durumları kısmen açık.** İmleç baştayken üste ekleme ve Backspace sallanması eklenmiş, ama boş alt görevde Enter hâlâ yeni boş satır açıyor (beklenti: girintiyi azalt). Açık üstte yeni satır alt ağacın sonuna ekleniyor. *(TodoNote)*
- **Mobil kart kutucukları.** Dokunma alanı 32 px (`.hit` padding 7). İki satırlı görevlerde komşu hedefler birbirine çok yakın. Tablette 44 px. Mobilde 40 px'e çıkarılsın ya da satırın sol 44 px'i hedef yapılsın. *(MHome, MProject)*
- **MTodo ve MText üst çubukları farklı.** MText'te Arşivle var, MTodo'da yok (ikisi de ⋮'da var). İki tür aynı üst çubuğu kullansın.
- **MNoteMenu'de "Not hatırlatıcısı" iki yerde.** Hem üst çubukta hem menüde. Menüdeki satır çipi gösterdiği için kalabilir, ama MTodoMenu'de yok; ikisi eşitlensin.
- **Onay başlıkları.** "Projeden ayrılmak istiyor musun?" diğer başlıkların "…silinsin mi? / …çıkarılsın mı?" kalıbından ayrılıyor ve iki satıra kırılıyor. → "Projeden ayrılıyor musun?" *(Dialogs2, MConfirm)*
- **Proje silmede ad yazdırma yok.** Hesap silmede e-posta yazdırılıyor, proje silmede yazdırılmıyor. 7 günlük geri getirme olduğu için kabul edilebilir; ama 10'dan fazla notlu projeler için ad yazdırılması düşünülsün. *(Dialogs2, MConfirm)*
- **Forms'taki örnek toast çelişkili.** "'Kitap Kulübü' projesine kopyalandı" yazıyor, ama kullanıcı Kitap Kulübü'nde görüntüleyici ve oraya not ekleyemiyor. Örnek "Ev Taşınma" olsun.
- **Teknik ifade.** "Bu form Cloudflare Turnstile ile korunur." yerine "Bu form otomatik kayıtlara karşı korunur." *(Auth, MRegister)*
- **Composer'daki "Kapatınca kaydedilir".** Kapatmazsam kaybolur mu sorusunu doğuruyor. Not her durumda kaydediliyorsa "Otomatik kaydedilir" yazsın. *(Composer)*
- **MInvites'taki açıklama planla çelişiyor.** "Davetler yalnızca uygulama içinden… gönderilir" deniyor, oysa plan e-posta bildirimi de gönderiyor. → "Davetleri proje yöneticileri gönderir; e-postayla da haber verilir." "Reddet" için onay ya da toast + Geri al hâlâ yok.
- **Şifre alanları.** Hiçbir giriş, kayıt ya da sıfırlama ekranında göster/gizle düğmesi yok. MVerify'da "Adres yanlış mı? Değiştir" ve tekrar gönderme bekleme sayacı yok. *(Auth, TAuth, MAuth, MRegister, MReset, MVerify)*
- **Ayarlar'daki "Davet e-postası" anahtarı.** Plan "e-posta yalnızca davet…" diyor; davet e-postasının kapatılabilmesi bilinçli bir karar mı, netleştirilsin (ilk turdan açık).
- **Mobil boş proje.** Yalnızca "Yapılacaklar notu" düğmesi var; metin notu için "Projeye not ekle…" alanına güveniliyor. Masaüstü boş durumundaki "Not al / Yapılacaklar notu" ikilisi burada da kullanılsın. *(MStates, States2)*
- **MHome FAB menüsü.** "Metin notu" seçeneği alttaki "Not al…" alanıyla aynı işi yapıyor. FAB yalnızca "Yapılacaklar notu"na kısayol olabilir ya da ikisi kalacaksa alan "Metin notu al…" diye adlandırılabilir.

---

## 5. İyi çalışanlar

- **Tamamlama akışı.** Satırlar 1,2 sn yerinde kalıyor; zincirleme tamamlamada toast üst görevin adını veriyor; geri al tam olarak değişen satırları açıyor ve odağı geri getiriyor. İşaret kaldırılınca ilgili toast kendiliğinden kapanıyor.
- **Klavye.** Esc katmanları doğru sırada (kart → seçici → ayrıntı → listeden çık). Shift+Enter odağı açıklamaya taşıyor. Ctrl+Shift+A odağı ilk üyeye götürüyor. Kısayol kartı odağı alıp geri veriyor.
- **Tarih seçici.** Görünür "Başlangıç / Bitiş" etiketleri; doğal yazım alanı ve anlaşılır hata ("Anlaşılmadı · ör. yarın, cuma, 15 kasım"); geçersiz aralıkta satır içi uyarı; "Tarihleri temizle"; ay okları; "Hatırlat · Atananlara gider". Türkçe katlama (`toLocaleLowerCase('tr')`) ve geçmiş tarihin gelecek yıla kayması doğru düşünülmüş.
- **Taşı / kopyala.** Birincil düğme hedefi adıyla söylüyor ("Ev Taşınma projesine taşı", "Kişisel alanıma kopyala"). Proje notu için ayrı "Notu kopyala" paneli üç cihazda da var ve neden taşınamadığını açıklıyor. Görüntüleyici olunan proje soluk ve gerekçeli.
- **Onay diyalogları (Dialogs2, MConfirm).** Hepsi nesneyi adıyla ve sayısıyla gösteriyor ("14 not · 5 üye", "Çöpte · 2 gün kaldı"). Tek yönetici durumu "Proje ayarlarına git" ile çıkış yolu sunuyor. Dönüşüm uyarıları kaybolacak veriyi tek tek sayıyor.
- **Hatırlatıcı sheet'i.** Alıcılar avatarlarla gösteriliyor, "Bir kez çalar. Saat dilimi: İstanbul (tarayıcıdan)." yazıyor, kişisel notta "yalnızca sana" farkı açıklanıyor.
- **Kart menüsünün yeni sırası.** Sabitle · Renk · Hatırlatıcı · Taşı/kopyala · Kopyasını oluştur · Sürüm · Dönüştür · ayraç · Arşivle · Çöpe at mantıklı: sık ve geri alınabilir olanlar üstte, yıkıcı olanlar ayraçtan sonra. Tablette ⋮ hep görünür (hover bağımlılığı yok).
- **Arama.** Gizli tamamlanmış göreve "Tamamlandı" çipi; sonuçsuz durumda "erişebildiğin 3 projede başlık, metin ve görev başlıklarına bakıldı"; placeholder her yerde aynı.
- **Mobil temeller.** 44 px üst çubuk düğmeleri; tek elle erişilen alt "Not al" ve etiketli FAB menüsü; çöpte kart başına ⋮ menüsü; çekmecede kullanıcı kimliği.
- **Durumlar.** Silinmiş projeler listesi (kalan gün, kırmızı "yarın silinecek"), dosya boyutu hatası, push bildirim örnekleri, "Son eşitleme: bugün 14:02".
- **Kontrast.** Rail proje harfleri artık 4,8–5,2:1. Toast metinleri açık ve koyu temada 5:1'in üzerinde.

---

## 6. Uygulama aşamasına notlar

- **Toast altyapısı:** Tek bir `role="status"` bölgesi uygulama kabuğunda dursun. Açık bir modal varsa toast modalın içine yansıtılsın. Kuyruk ya da birleştirme olsun. Hover, odak ya da sekme görünmezken süre dursun. Ctrl/⌘+Z son toast işlemini geri alsın; not içindeki Yjs geri almasıyla çakışmaması için öncelik kuralı yazılsın (önce metin düzenlemesi, sonra yapısal işlem). `prefers-reduced-motion`'da 1,2 sn'lik yerleşme animasyonsuz kalsın, süre korunsun.
- **Sheet bileşeni:** Tek bileşen olsun (Radix Dialog + sürükleme). Her zaman odaklanabilir bir kapatma, `max-height: 90dvh` ve iç kaydırma, `visualViewport` ile klavye üstüne konum, Android geri tuşunun önce sheet'i kapatması (history state), kapanınca tetikleyiciye odak dönüşü.
- **Dokunmatik kart eylemleri:** Mobilde kart üstü eylem yok; Keep benzeri uzun basma ile seçim modu (sabitle, renk, arşivle, çöpe at) ya da kart ⋮'si eklenmeli. Uzun basma, sürükleme ve kaydırma çakışması için 300 ms eşik ve titreşim geri bildirimi kullanılsın.
- **Hover karşılıkları:** Masaüstü kart hover çubuğu `:focus-within` ile de görünsün (CardStates'teki "klavye odağı" hâlinde çubuk yok). Satırdaki `.hov` düğmeleri dokunmatik genişlikte (`(hover:none)`) her zaman görünsün; TTodo'da öyle, bu kural CSS'e taşınsın.
- **Yetki:** Görüntüleyicinin "Kopyala…" ile kendi alanına kopyalayıp kopyalayamayacağı planda yok; karar verilip menü buna göre gösterilsin. Not açıkken rol düşerse açık sheet ve seçiciler kapansın, bant çıksın.
- **Arama derin bağlantısı:** Tamamlananlar içindeki göreve giderken "Tamamlananlar" grubu ve üst dallar açılsın, satır 2 sn vurgulansın. Bu açılma kişinin kalıcı açık/kapalı durumuna yazılmasın.
- **PWA ve bildirim izni:** İzin isteği ilk hatırlatıcı kurulduğunda, uygulama içi bir açıklamadan sonra gelsin. iOS'ta push yalnızca kurulu PWA'da çalışır; izin akışı kurulum ipucuyla birleştirilsin. Reddedilen izin Ayarlar'daki anahtarlarda "Tarayıcıda engelli · nasıl açılır" olarak görünsün.
- **Çevrimdışı:** Kutucuk, "Not al", FAB ve sheet tetikleyicileri tek bir `offline` bayrağıyla devre dışı kalsın. Önbellekten açılan notta araç çubuğu gizlensin.
- **Güvenli alan:** FAB, mobil araç çubuğu ve sheet alt boşlukları `env(safe-area-inset-bottom)` ile hesaplansın; MHome'daki 16 px alt boşluk iPhone ana çubuğunda yetmez.
- **Metin birliği:** Görüntüleyici cümlesi, "Projeye taşı / kopyala…", "Not hatırlatıcısı" ve toast kalıpları bir sözlük dosyasında (i18n anahtarları) tek kaynaktan gelsin. "da/de" ünlü uyumu ve "-e/-a" ekleri (proje adına göre "Ev Taşınma projesine") için ortak yardımcı fonksiyon yazılsın; TodoNote'taki `daDe()` buna örnek.
