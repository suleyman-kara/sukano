# Sukano tasarımı: masaüstü / tablet / mobil tutarlılık raporu

Kapsam: design/project/ altındaki 64 *.dc.html + canvas.json, docs/PLAN.md. Satır numaraları ilgili .dc.html dosyasınadır. "Ref" = esas alınacak hal.

## Uyumlu bulunanlar (düzeltme gerekmez)
- Ana belirteçler ve 10 not rengi her dosyada aynı (istisna: --shadow ve --dim, bkz. O2, K11).
- Proje renkleri (#AD5A34 / #3F6DB5 / #4A7D45 / #9E4F72 / #6F5DAE / #87691A / #4F6C7A) her yerde aynı; eski renkler kalmamış.
- Avatarlar AD #B25D49, MK #4976B4, ZA #7A5FB8, CY #398264, SK #597895 tutarlı.
- Onest, kelime işareti -0.01em, logo SVG tutarlı.
- Üye listesi ve roller, görev verisi (t2 3 → 12 Kas 17:00, t3 4 Kas, t12 Bugün, t6 20 Kas, 1/3, Tamamlananlar (2)) tutarlı.
- "Geri yükle" (çöp, sürüm) / "Projeyi geri getir" / "Geri al" (toast) / "Tarihleri temizle" (görev tarihi) / "Kaldır" (not hatırlatıcısı, ek, fotoğraf) kendi bağlamında tutarlı.
- Hatırlatıcı alıcısı metinleri plana uygun.

## BÜYÜK (13)

### B1. "Tek yönetici olduğun proje" yanlış proje
- Settings.dc.html:153, TSettings.dc.html:160: "Web Sitesi Yenileme" yazıyor; ProjectSettings ailesi bu projede 2 yönetici gösteriyor. Dialogs2'de tek yönetici olunan proje "Ev Taşınma".
- Düzeltme: iki dosyada "Ev Taşınma" yaz.

### B2. "Ev Taşınma" rolü çelişiyor
- Notifications.dc.html:124, TNotifications.dc.html:147, MNotifications.dc.html:152: "Ev Taşınma projesindeki rolün Düzenleyici olarak değişti · Mehmet Kaya". Kullanıcı Ev Taşınma'da yönetici; Mehmet düzenleyici olduğu için rol değiştiremez.
- Düzeltme: "**Web Sitesi Yenileme** projesindeki rolün **yönetici** olarak değişti · **Ayşe Demir** · 3 Kas" (küçük harf, bkz. K2).

### B3. "Kopyala" iki farklı eylem için kullanılıyor
- TextNote:184, TText:211, TodoNote:312, TTodo:304, MNoteMenu:155, CardStates:277, Forms:168/171/175, THome:151 (+THomeNav).
- Ref: Forms.dc.html 160–175. Üç terim: "Kopyasını oluştur" (aynı alanda yinele), "Kopyala…" (proje notunu başka alana kopyala, Dialogs2 son panel), "Projeye taşı / kopyala…" (kişisel not, Dialogs sekmeleri).
- Düzeltme: TextNote ve TText: iki düğme yerine tek "Projeye taşı / kopyala…"; TodoNote ve TTodo: title/aria-label "Kopyala…"; CardStates:277: "Projeye taşı" → "Projeye taşı / kopyala…"; MNoteMenu: "Kopyala" → "Kopyasını oluştur", "Projeye taşı" → "Projeye taşı / kopyala…"; THome/THomeNav kart menüsüne "Kopyasını oluştur" ve "Sürüm geçmişi" ekle (O7).

### B4. Mobilde metin ↔ yapılacaklar dönüşümü yok; yapılacaklar "Diğer" menüsü yok
- MText, MNoteMenu, MTodo (ve MTodoDate, MTodoWho, MReminder, MVersions zemini).
- Düzeltme: MNoteMenu'ye "Sürüm geçmişi"nden sonra "Yapılacaklar notuna dönüştür"; yapılacaklar notu için Forms menüsünün (Tümünü aç / Tümünü kapat / Tamamlananları sil / Kopyasını oluştur / Metin notuna dönüştür / Sürüm geçmişi / Kopyala…) bottom-sheet sürümü (yeni MTodoMenu).

### B5. Tablet ve mobilde iç "Tamamlananlar (1)" grubu eksik
- TTodo (225 civarı), MTodo, MTodoDate, MTodoWho, MReminder, MVersions: "Mobil görünüm" satırından sonra 1. seviye girintiyle daraltılmış "› Tamamlananlar (1)" ekle. Ref TodoNote.

### B6. Mobil çekmecede Arşiv/Çöp çipleri
- MDrawer.dc.html:44: çip satırını kaldır (kapsül zaten var).

### B7. Turnstile görünür kutu (plan: görünmez)
- Auth.dc.html:73, MRegister.dc.html:143: kutuyu kaldır; düğme altına 12 px soluk "Bu form Cloudflare Turnstile ile korunur."

### B8. Kartta gösterilen görev sayısı
- MHome:82, MNewProject:133, MOffline:136: Haftalık plan 3 görev + "+5"; ref Main:155 (5 görev + "+3"). "Elektrik faturası" ve "Kütüphane kitaplarını iade et" satırlarını ekle, "+3 görev daha".
- MProject:108 (2 görev + "+3"), Project:172, TProject:176 (3 görev + "+2"): Müşteri geri bildirimleri 5 görevin hepsini göster, "+N" kaldır.

### B9. Mobil arama placeholder'ı
- MProject:59 "Projede ara"; MHome:59, MArchive:124, MNewProject:124, MOffline:124 "Notlarda ara". Ref: "Notlarda ve projelerde ara"; sığmazsa her yerde "Ara".

### B10. Mobil proje notunda "oluşturan / son düzenleyen" satırı yok
- MTodo, MTodoDate, MTodoWho, MReminder, MVersions: başlığın altına "Ayşe Demir oluşturdu · Son düzenleyen Mehmet Kaya, 2 saat önce" (12–13 px, --muted).

### B11. "Fotoğraf Arşivi" rengi
- States2:155 ve 158 (#6F5DAE) → #9E4F72 (Invites ailesi).

### B12. "Üye davet et" vs "Davet gönder"
- States2:128, MStates:149: "Davet gönder".

### B13. Tablette proje notu "Kopyala" taşıma diyaloğunu açıyor
- TTodo:304 → TDialogs; TDialogs'ta yalnızca kişisel not paneli var. TDialogs'a "Proje notu · kopyala" panelini (Dialogs2 son panel metinleriyle) ekle ve TTodo:304'ü ona bağla. Mobilde MMove'a ikinci hal (proje notu · kopyala) ekle.

## ORTA (16)

### O1. Görünüm kapsülü seçili hali
- Mobil (MHome:51, MProject:51, MArchive:48, MTrash, MNewProject, MOffline): `.vs a.on` → `background:var(--surface);color:var(--accent);box-shadow:0 1px 2px rgba(0,0,0,.08)`. Etiket kuralı: masaüstünde hepsi, tablette yalnızca seçili, mobilde yok.

### O2. Mobil --shadow
- 21 mobil dosyada `rgba(28,27,25,.12)` → `.08` (ref Main:16).

### O3. Tehlike düğmesi
- Mobil 19 dosyada kenarlık `color-mix(...)` → `var(--danger)`. Kural: onay diyaloğundaki son eylem dolu (Dialogs2:31), sayfa içi tehlike düğmesi çerçeveli (Settings:37).

### O4. Anahtar (.sw) ölçüleri
- TodoNote:119 34×20 → 38×22; TSettings:75 44×26 → 42×24; TTodo:132 38×22 → 42×24. Masaüstü 38×22, dokunmatik 42×24.

### O5. Düğme/girdi sapmaları
- Trash:36 .btn 36 px/0 14 → 38 px/0 16. Auth:26 .btn/.input 44 px → 38/40 (bilinçli değilse). TAuth .input 48 radius 10 font 15 → 44 px radius 10 (tablet ailesi).

### O6. Kart ölçüleri
- Tablet .card padding `16px 16px 14px` → `16px 16px 12px` (THome:66 ve 7 T* dosyası). Mobil küçük ölçek kabul.

### O7. Kart ve not menülerinin sırası
- Kanonik sıra: Sabitle · Renk · Hatırlatıcı · Projeye taşı / kopyala… · Kopyasını oluştur · Sürüm geçmişi · Dönüştür · ayraç · Arşivle · Çöpe at. Masaüstü "Diğer" menüsü çubukta zaten olanları (Projeye taşı, Çöpe at) tekrarlamasın. Tablet kart menüsüne (THome:151, THomeNav) Kopyasını oluştur, Sürüm geçmişi, Dönüştür ekle. MNoteMenu ve açık not çubukları (TextNote, TText) bu sıraya uysun.

### O8. Masaüstü üst çubuğu
- Settings (arama yok), ProjectSettings:86 ("Projeye dön" arama yerine): arama alanı ekle; "Projeye dön" başlığın üstüne (ref TProjectSettings).

### O9. Davetler rozeti
- TodoNote:184, TextNote:93: "Davetler, 1 bekleyen davet" ve rozet ekle.

### O10. Açık yapılacaklar notunda Sabitle yok
- TodoNote, TTodo: başlık satırına iğne düğmesi (varlık avatarları ile kapat arasına).

### O11. CardStates kartta "son düzenleyen" avatarı
- CardStates:262: bu hali kaldır (plan: kartlar sade).

### O12. Mobil tarih seçicide doğal yazım alanı yok
- MTodoDate: hızlı seçeneklerin üstüne "yarın, cuma, 15 kasım…" alanı ekle.

### O13. Aile dışına giden bağlantılar
- MAuth:49 → MForgot/MRegister; MDrawer → MArchive, MTrash, MNewProject, MInvites; MHome:70–71 → MArchive, MTrash, MNotifications; MProject:71–72 → MArchive, MTrash, MNotifications, MProjectSettings; MSettings → mobil karşılıkları (yoksa kalsın); MProjectSettings, MTrash → yeni MConfirm sheet'i.

### O14. Mobil veriler kısaltılmış
- MProject: proje açıklaması yok; avatar yığınında SK yok ("5 üye" ama 4 avatar); kart metinleri kısaltılmış. MHome/MOffline/MNewProject: Wifi, Toplantı, Ev tadilatı gövdeleri kısa. MText/MNoteMenu: gövde kısaltılmış. Mobil yapılacaklar zeminlerinde varlık yalnızca MK (ref MK + ZA).
- Düzeltme: metinleri aynen kopyala, uzunluğu `-webkit-line-clamp` ile kes; MProject'e açıklama ve SK; varlıkta ZA.

### O15. Kapsanmayan haller
- Öncelik: (1) mobil onay sheet'leri (Dialogs2 metinleriyle; en az proje silme sheet'i çizilsin, diğerleri aynı kalıp), (2) mobil ve tablet görüntüleyici proje sayfası, (3) mobil PWA kurulum ipucu.

### O16. canvas.json
- $preview ile h uyuşmuyor: CardStates 960/1024, Composer 960/1031, Dialogs2 1730/1766, Forms 1368/1409, States2 1424/1467 → $preview'ı pano boyuna çek.
- is_interactive: MHome, MProject setState içeriyor → true; HomeDark → true.
- expand: HomeDark, TodoDark'a "fill" ekle; statik tuvallerde (States, Dialogs2, Forms, States2) tek kural (hepsinde fill yok).

## KÜÇÜK (15)

### K1. Simge yolu varyantları
- Kopyala: ref A (`rect x9 y9 11×11 + M5 15V5a1 1 0 0 1 1-1h10`); CardStates ve Forms A'ya.
- Sürüm geçmişi: ref A (`M3 12a9 9 0 1 0 3-6.7 / M3 4v5h5 / M12 8v4l3 2`); CardStates, Dialogs2, Forms A'ya.
- Not simgesi: Dialogs, Dialogs2'de iç çizgiler (`M8 13h8M8 17h5`) eksik; ekle.
- Klavye: Forms → TodoNote'taki yol.
- Sürükleme tutamacı: States2 r=1.5 → 1.6.
- "Diğer": MTrash:151,155,162 yatay → dikey üç nokta.

### K2. Rol adları cümle içinde küçük harf
- Notifications:124, TNotifications:147, MNotifications:152 ve States2 "seni düzenleyici olarak ekledi".

### K3. Tarih biçimi
- Forms:129, MReminder:161 "Pzt 9 Kas, 09:00" → "Pzt, 9 Kas, 09:00". Invites:112/120, TInvites:120/128, MInvites:154/164 "12 Ekim", "3 Eylül" → "12 Eki", "3 Eyl".

### K4. Arama kaynak etiketi
- Search:112, TSearch, MSearch: "Kişisel" → "Notlarım".

### K5. States görüntüleyici notu: ", 2 saat önce" ekle.

### K6. 404 metni: States:108, TStates:88 "proje kapatılmış" → "proje silinmiş".

### K7. Kelime işareti boyutu: MDrawer 19 → 18 px; Auth 20 → 22 px.

### K8. MAuth:49 "Şifremi unuttum" etiket satırına, MForgot'a bağla.

### K9. Hatırlatıcı düğmesi adı: TodoNote:311, TTodo:303 "Not hatırlatıcısı"; metin notlarında da "Not hatırlatıcısı" kullan (görevdeki "Hatırlat"tan ayırmak için).

### K10. Görüntüleyici açıklaması tek kök cümle: "Okur ve arar; not ekleyemez, görev işaretleyemez." (ProjectSettings, States, States2, Dialogs bağlamına uyarlanarak).

### K11. --dim iki anlamda: Dialogs, Dialogs2, Forms, States2, TDialogs tuval zemini için `--stage` adını kullan.

### K12. Arka plandaki sönük kartlar: TodoNote:211, TTodo:177, TextNote, TText, Notifications, TNotifications: kart işaretlemesini Main/Project'ten aynen al (kutucuklu liste).

### K13. Arşivdeki "Tüm görevler tamamlandı" özeti: Archive:128, TArchive:141, MArchive:140: kabul (plana not düşülecek), değişiklik yok.

### K14. canvas.json başlıkları ve notları
- TStates "…PWA, hata"; MTrash "Çöp kutusu"; MAuth "Mobil — Giriş" kalsın.
- Logo ve Fonts panolarını "Keşif" başlıklı ayrı satıra taşı (y=11300 civarı, başlık notu).
- r1–r4 maxW 6000 → 10600; tablet ikinci satırına (y=9594) başlık notu gerekmez (aynı aile), ama r6 maxW 7400.
- "tip" notunun metnini güncelle: "Masaüstü ekranlarında Tweaks: theme (açık/koyu) ve sidebar (open/collapsed). Yapılacaklar notu, Giriş, Diyaloglar, Not al ve kart halleri etkileşimli: Play ile dene. Satırlar: masaüstü, projeler, arşiv/çöp/davetler, ayarlar/durumlar/koyu tema, mobil, tablet, keşif."

### K15. Küçük farklar
- TText "Düzenlendi" satırını TextNote gibi Kapat'ın yanına.
- MNoteMenu paleti 2 satıra böl.
- Masaüstü/tablet Ayarlar'a "Sukano · sürüm 1.0" satırı ekle (MSettings ile tutarlı).
