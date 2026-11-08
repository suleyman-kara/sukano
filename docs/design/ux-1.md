# Sukano: kullanılabilirlik (UX) değerlendirmesi

Kapsam: canvas.json'daki 25 artboard (Dialogs2 gibi sonradan eklenenler değerlendirmeye alınmadı), PLAN.md ve `fonts/shots/onest/` altındaki açık/koyu ekran görüntüleri. TodoNote.dc.html'in davranışı `data-dc-script` kodundan okundu. Tasarım dosyalarına dokunulmadı.

---

## 1. Genel değerlendirme

Sukano'nun görsel dili sakin ve tutarlı. Keep mantığı tanıdık geliyor: "Not al" alanı, sabitlenmiş/diğerleri bölümleri ve renkli kartlar yeni kullanıcıyı hemen yönlendiriyor. Proje, rol ve davet ekranları plandaki kuralları açıkça anlatıyor. "Görüntüleyici, not ekleyemez", "12 gün sonra geçersiz" ve "Mehmet Kaya çöpe attı · 2 gün sonra silinir" gibi bağlam metinleri güçlü yanlar. Zayıflık ürünün "kalbi" sayılan yapılacaklar notunda toplanıyor. Klavye akışı Tab'ı ele geçirdiği için klavye kullanıcısı satırdan çıkamıyor; seçiciler klavyeyle kullanılamıyor; görev tamamlanınca odak ve satır kayboluyor; satırda iki ayrı ok aynı simgeyle iki ayrı işi yapıyor. Geri alma katmanının hiçbir ekranda çizilmemiş olması da riskli kurallar için büyük bir boşluk: otomatik üst görev tamamlama, taşınamayan proje notu, herkese giden hatırlatıcı. Bu boşluk kapanmadan bu kurallar kullanıcıyı şaşırtacak.

**Puan: 7 / 10.** Görsel ve bilgi mimarisi 8 düzeyinde. Yapılacaklar notunun etkileşim ayrıntıları ve geri bildirim/geri alma katmanı puanı aşağı çekiyor.

---

## 2. Yüksek etki

### Y1. Yapılacaklar notunda klavye tuzağı; seçiciler klavyeyle kullanılamıyor
- **Sorun:** `key()` içinde Tab ve Shift+Tab her durumda `preventDefault` ile girintiye bağlanmış. Odak bir görev başlığına girdiğinde Tab ile satırdaki takvim/kişi/ayrıntı düğmelerine, akordeondaki açıklama alanına ya da alt araç çubuğuna (renk, arşiv, kapat) geçmenin yolu yok. Escape yalnızca seçiciyi kapatıyor, odağı dışarı çıkarmıyor. Ctrl+D ve Ctrl+Shift+A seçiciyi açıyor ama odak başlıkta kalıyor. Seçicideki "Bugün / Yarın / takvim" düğmelerine ulaşmak için Tab gerekiyor, o da kilitli. Plandaki "Türkçe doğal yazım ('yarın', 'cuma', '15 kasım')" için seçicide bir metin alanı da yok. Shift+Enter akordeonu açıyor ama odak içeri taşınmıyor. Ctrl+Enter ile tamamlanan satır, kapalı "Tamamlananlar" grubuna inince DOM'dan kalkıyor ve odak `body`'ye düşüyor; ardından ↑/↓ çalışmıyor.
- **Neden önemli:** Planın vaat ettiği "klavyeyle akar" deneyimi tam da burada kırılıyor. Bu ayrıca WCAG 2.1.2 (klavye tuzağı) ihlali. Sezgiseller: kullanıcı kontrolü ve özgürlüğü, esneklik.
- **Çözüm:** (a) Seçici açılınca odak seçicinin ilk alanına gitsin. Bu alan bir metin kutusu olsun: "yarın 17:00" yazılıp Enter'a basılınca tarih kaydedilsin, odak satıra dönsün. Seçicide ok tuşlarıyla takvimde gezinilsin. (b) Shift+Enter akordeonu açınca odak açıklama alanına geçsin; Escape satıra döndürsün. (c) Escape, odak başlıktayken odağı not düzeyine çıkarsın; bir sonraki Tab alt araç çubuğuna gitsin. Kısayol kartına "Esc · listeden çık" satırı eklensin. (d) Tamamlanan satırdan sonra odak görünür bir sonraki satıra (yoksa bir öncekine) taşınsın.
- **Artboard:** TodoNote, TodoDark.

### Y2. Tamamlanan görev ve kendiliğinden tamamlanan üst görev bir anda gözden kayboluyor
- **Sorun:** `toggleDone` üst görevi, son alt görev işaretlendiği anda tamamlıyor. Bütün ağaç da hemen kapalı "Tamamlananlar (n)" grubuna iniyor. Örnek: "Tasarım onayı" altında "Ürün sayfası" ve "Mobil görünüm" açık. İkisi işaretlenince kullanıcının baktığı üç satır birden yok oluyor ve ekranda hiçbir açıklama çıkmıyor. Herhangi bir ekranda geri al bildirimi (toast) çizilmemiş.
- **Neden önemli:** Kullanıcı "görevim nereye gitti?" diye sorar, özellikle bir başkası aynı notta işaret koyduğunda. Bu, planın en riskli kuralı. Sezgiseller: sistem durumunun görünürlüğü, kontrol ve geri alma.
- **Çözüm:** İşaretlenen satır 1–1,5 sn üstü çizili olarak yerinde kalsın, sonra aşağı insin. Üst görev kendiliğinden kapanınca alt kenarda bir toast çıksın: "Tüm alt görevler bitti, 'Tasarım onayı' da tamamlandı · Geri al". Toast 6–8 sn ekranda kalsın. Kural ilk kez çalıştığında bir kerelik bir ipucu da gösterilebilir.
- **Artboard:** TodoNote, MTodo.

### Y3. Satırdaki iki ok iki farklı işi yapıyor; "1/3" ipucu belirsiz
- **Sorun:** Soldaki ok (`.chev`) alt görevleri açıyor. Sağda hover ile beliren aşağı ok (`.hov`, "Ayrıntıları aç") akordeonu açıyor. Ekran görüntüsünde "İçerik yazımı" satırında aynı anda solda kapalı bir ok ve sağda açık bir ok var. Sağdaki ok hover olmadan görünmüyor. Plan "satıra tıklayınca akordeon" diyor; prototipte satıra tıklamak yalnızca başlığa imleç koyuyor. "1/3" ipucu "1 bitti / 3 toplam" anlamına geliyor. Ancak kullanıcının gördüğü iki açık satır ve "Tamamlananlar (1)" ile bu sayı ancak hesap yapınca örtüşüyor. Planda ise yalnız "3" yazıyor.
- **Neden önemli:** Akordeon, tarih, açıklama ve "alt görev ekle"nin tek yeri. Keşfedilemezse bu özellikler kullanılmaz. Sezgiseller: tutarlılık, tanıma > hatırlama.
- **Çözüm:** Akordeonun tetikleyicisi oktan farklı bir simge olsun ("ayrıntı" ya da "⋯" panel simgesi). Akordeon açıkken satır vurgulu kalsın, sağdaki ok gizlensin. Yalnız başlık dışındaki boş satır alanına tıklamak da akordeonu açsın. İpucu için ya yalnız toplam sayıyı ("3") ya da açık bir biçimi ("1/3 bitti") kullanın, title/aria metni de "3 alt görevden 1'i tamamlandı" olsun.
- **Artboard:** TodoNote, MTodo.

### Y4. Atama: görüntüleyiciye görev atanabiliyor, kullanıcı kendini atayamıyor
- **Sorun:** Kişi seçicideki `MEMBERS` listesinde Ayşe, Mehmet, Zeynep ve Can var; kullanıcının kendisi (Süleyman Kara) yok. Can Yılmaz ProjectSettings'te **Görüntüleyici**, ama "İçerik yazımı" ve "Barındırma kurulumu" görevlerine atanmış. Plana göre görüntüleyici kendisine atanan görevi işaretleyemez. Seçici rol göstermediği için atayan kişi bu sonucu öngöremiyor.
- **Neden önemli:** "Bana atandı ama işaretleyemiyorum" en kolay doğacak destek talebi. Sezgiseller: hata önleme, gerçek dünya eşleşmesi.
- **Çözüm:** Seçicinin en üstünde "Ben" bulunsun. Görüntüleyiciler ya listede hiç gösterilmesin ya da soluk ve "Görüntüleyici · işaretleyemez" etiketiyle gösterilsin; tercih edilen ilki. Rol düşürülünce mevcut atamalar için yöneticiye "Can'ın 2 ataması var, kaldırılsın mı?" diye sorulsun. Seçiciye üye sayısı büyüdüğünde arama kutusu eklensin.
- **Artboard:** TodoNote (kişi seçici), ProjectSettings, States (görüntüleyici).

### Y5. Taşı / Kopyala ayrımı simgelerde ve diyalogda bulanık; geri dönüşsüzlük yeterince vurgulanmıyor
- **Sorun:** Metin notunun alt çubuğunda klasör ("Projeye taşı") ve iki kare ("Kopyala") yan yana duruyor ve ikisi de aynı diyaloğa gidiyor. Plandaki "Kopyasını oluştur" (aynı alanda çoğaltma) ile "başka alana kopyala" ayrımı simgelerde yok. Diyaloğun başlığı "Notu projeye taşı" sabit; Kopyala sekmesine geçince de değişmiyor. "Geri almak için proje içinden kişisel alana kopyalayabilirsin" cümlesi yanıltıcı: kopyalamak geri almak değil, orijinal projede kalmaya devam ediyor. Proje notundan (TodoNote) açılan kopyalama diyaloğunun hedef listesi ("Notlarım" + projeler) çizilmemiş.
- **Neden önemli:** Taşıma kişisel notu kalıcı olarak ekibin malı yapıyor. Yanlış projeye taşınan özel bir not, ekipteki herkese görünür. Sezgiseller: hata önleme, tutarlılık, gerçek dünya eşleşmesi.
- **Çözüm:** Simgeler şöyle olsun: "Projeye taşı" (klasör + ok), "Kopyasını oluştur" (yalnız "Diğer" menüsünde, aynı alana) ve "Başka yere kopyala" (diyalogda). Diyalog başlığı sekmeye göre değişsin. Taşı sekmesinin bilgi metni "Bu işlem geri alınamaz. Not projeye geçer; daha sonra yalnızca kopyası kişisel alana alınabilir." olsun. Taşıdan sonra çıkan toast'ta kısa bir süre (örneğin 10 sn) gerçek bir "Geri al" sunulsun; bu, plandaki "taşınamaz" kuralını işlem anındaki hata için esnetir. Proje notu için "Kopyala" diyaloğu ayrıca çizilsin.
- **Artboard:** Dialogs, TextNote, TodoNote, Main (kart hover çubuğu).

### Y6. Geri alma ve geri bildirim katmanı hiç çizilmemiş; "Geri al" üç anlamda kullanılıyor
- **Sorun:** Arşivle, çöpe at, taşı, renk değiştir, tamamla, "Tamamlananları sil" ve görev sil (boş satırda Backspace) için hiçbir ekranda toast ya da durum mesajı yok. Prototipte Ctrl+Z kısayol kartında listeleniyor ama uygulanmamış. "Geri al" aynı anda üç anlamda geçiyor: çöpten geri yükleme düğmesi (Trash), silinmiş projeyi kurtarma (States) ve Ctrl+Z ile yapılanı geri alma (kısayol kartı). Sürümlerde ise "geri yükle" kullanılıyor.
- **Neden önemli:** Kullanıcı bir işlemi yaptığını ve onu düzeltebileceğini görmezse her tıklamada tereddüt eder. Sezgiseller: görünürlük, kontrol, tutarlılık.
- **Çözüm:** Tek tip bir alt toast tasarlansın: "Not arşivlendi · Geri al", "Not çöpe taşındı · 7 gün içinde Çöp'ten geri yüklenebilir · Geri al", "3 tamamlanan görev silindi · Geri al". Toast `role="status"` ile duyurulsun. Adlandırma şöyle ayrılsın: **Geri al** yalnızca az önce yapılanı geri almak için; **Geri yükle** çöp, silinmiş proje ve sürüm için; **Arşivden çıkar** zaten doğru.
- **Artboard:** Trash, States, TodoNote, Main, Archive.

### Y7. Hatırlatıcının kime gittiği hiçbir yerde söylenmiyor
- **Sorun:** Not hatırlatıcısı için yalnızca bir zil düğmesi ve "Yarın, 09:00" çipi var. Hatırlatıcı kurma seçicisi çizilmemiş, çip de tıklanabilir değil (`span`). Proje notunda hatırlatıcı **projedeki herkese** gidiyor, ama arayüz bunu hiçbir yerde belirtmiyor. Görev seçicisindeki "Hatırlat" anahtarı yalnızca atananlara gidiyor; bu da yazmıyor. Kullanıcı iki farklı alıcı kuralını ezberlemek zorunda kalıyor.
- **Neden önemli:** Kişisel bir hatırlatma niyetiyle kurulan saat 09:00 bildirimi beş kişiye gider ve bunun sosyal bir maliyeti var. Sezgiseller: görünürlük, hata önleme, tanıma > hatırlama.
- **Çözüm:** Not hatırlatıcısı seçicisi çizilsin ve altında alıcılar avatarlarla yazılsın: "Projedeki 5 kişiye bildirim gider". Görev "Hatırlat" anahtarının yanında "Zeynep, Can'a gider" yazsın; atanan yoksa "Sana gider". Çip tıklanınca düzenleme/kaldırma açılsın. Kişisel ihtiyaç için ileride "yalnız bana" seçeneği düşünülebilir; plan dışı olduğu için şimdilik yalnız metinle açıklanabilir.
- **Artboard:** TextNote, MText, TodoNote (tarih seçici), Notifications.

### Y8. Mobilde dokunma hedefleri ve alt çubuk anlamı
- **Sorun:** MHome ve MProject'te kart kutucukları 14 px ve kartın tamamı bir bağlantı (`a.card`). Plandaki "kart üzerinden işaretleme" mobilde ya kartı yanlışlıkla açar ya da hiç tutturulamaz. Alt çubuktaki "Not al…" alanı ve "+" düğmesi aynı yere (MText) gidiyor. "+" bir FAB gibi görünüyor ama ne oluşturduğu belirsiz ve kartların son satırını örtüyor. MTodo araç çubuğundaki en sağdaki yeşil ✓ "Tamamla" anlamına geliyor, ama iOS/Android'deki "Bitti / klavyeyi kapat" düğmesine çok benziyor. Klavyeyi kapatma ya da görevi silme düğmesi yok. Girinti simgeleri (iki çizgi + ok) etiketsiz.
- **Neden önemli:** Mobilde yapılacaklar düzenleme planın açık hedeflerinden biri, ve yanlış dokunuşla görev tamamlamak Y2'deki kaybolma sorununu tetikliyor. Sezgiseller: hata önleme, gerçek dünya eşleşmesi.
- **Çözüm:** Kart kutucuklarına en az 32–44 px'lik görünmez bir dokunma alanı verilsin; kartın geri kalanı açma alanı olsun. Alternatif olarak mobilde kart üstünden işaretleme kapatılsın. "+" ya kaldırılsın ya da "Not al" alanıyla birleştirilsin; ikisi kalacaksa "+" uzun basmada "Metin / Yapılacaklar" seçtirsin. Araç çubuğunda ✓ "Tamamla" sola, araçların yanına alınsın; en sağa klavye-kapat simgesi konsun. Düğmeler 40 px'ten 44 px'e çıkarılsın. Girinti düğmelerinin ilk kullanımında küçük bir etiket ("Alt görev yap") gösterilsin.
- **Artboard:** MHome, MProject, MTodo.

---

## 3. Orta

1. **Görünüm kapsülü (Notlar/Arşiv/Çöp) zor fark ediliyor.** Yalnız etkin sekmenin etiketi var; Arşiv ve Çöp yalnız simge. Mobilde hepsi simge. Davetler, Ayarlar ve Arama sayfalarında kapsül kayboluyor, arama alanının genişliği de sayfadan sayfaya değişiyor (Invites'ta 815 px'e uzuyor). Keep kullanıcısı Arşiv'i sol menüde arayacak. → Masaüstünde üç sekme de etiketli olsun. Kapsülün yeri sabit kalsın; uygulanmadığı sayfalarda gizlenmek yerine pasif görünsün. Mobilde çekmecede "Arşiv · Çöp (bu alan)" kısayolları da bulunsun. *(Main, Archive, Trash, Invites, MHome, MDrawer)* Sezgisel: tanıma > hatırlama.
2. **Rail'deki proje baş harfleri.** "W/E/K" baş harfleri aynı harfle başlayan projelerde ayırt edilemez. Beyaz yazının proje renkleri üzerindeki kontrastı 2,5:1 (yeşil #7FB07A) ile 3,3:1 (mavi) arasında. Gezinme `title` ile olsa da tooltip dokunmatik ekranda çıkmıyor. → Emoji/simge seçilmişse o gösterilsin. Harfler koyu renkle ya da koyulaştırılmış zeminle yazılsın. Hover/focus'ta proje adı yan etikette görünsün. *(Search, tüm masaüstü ekranlar "collapsed")* Sezgiseller: tanıma, erişilebilirlik.
3. **Tarih seçicinin iki yuvası etiketsiz ve sessiz düzeltmeler yapıyor.** Boş yuvalarda yalnız takvim simgesi var; "Başlangıç" ve "Bitiş" yazıları sadece aria'da. Başlangıç bitişten sonra seçilirse `fixRange` başlangıcı sessizce bitişe eşitliyor; `fmtRange` de onu gizliyor. Tarih yokken saat girilince bitiş sessizce "bugün" oluyor. "Kaldır" düğmesinin neyi kaldırdığı belli değil. Ay değiştirme oku yok. → Yuvaların altına küçük "Başlangıç / Bitiş" etiketleri eklensin. Geçersiz aralıkta kısa bir satır içi uyarı gösterilsin ("Bitişten sonra olamaz"). Düğme "Tarihleri temizle" olsun. Ay okları eklensin. *(TodoNote)* Sezgiseller: görünürlük, hata önleme.
4. **Enter ve Backspace kenar durumları.** Boş bir alt görevde Enter yeni boş satır açıyor; yaygın beklenti girintiyi azaltmak (Workflowy, Notion, Keep). Açık alt görevleri olan bir üstte Enter, yeni satırı tüm alt ağacın **sonuna** ekliyor ve imleç ekranda uzağa sıçrıyor. İmleç başlıktayken Enter metni yeni satıra taşıyor; tarih ve atamalar boş kalan eski satırda kalıyor. Alt görevi olan boş satırda Backspace hiçbir şey yapmıyor ve hiçbir geri bildirim vermiyor. → Boş satırda Enter = Shift+Tab (kökte ise not dışına çıkış). Açık üstte imleç sondaysa yeni satır ilk alt görev olsun. İmleç baştayken Enter, yeni boş satırı **üste** eklesin. Silinemeyen satırda kısa bir sallanma ya da ipucu gösterilsin. *(TodoNote)* Sezgiseller: gerçek dünya eşleşmesi, hata önleme.
5. **Arama sonucu gizli bir görevi işaret ediyor.** "Lansman hazırlığı › Görev: Barındırma kurulumu › Teklifi onaylat" sonucu, kapalı "Tamamlananlar" grubundaki iki seviye derin bir görev. Tıklanınca not açılıyor ama görev görünmüyor. Sonuçlarda arşivde ya da çöpte olma bilgisi de yok, oysa Archive "aramada görünmeye devam eder" diyor. Mobil proje sayfasında yer tutucu "Projede ara", masaüstünde "Notlarda ve projelerde ara"; kapsam tutarsız. Proje sayısı arttıkça süzgeç çipleri satıra sığmayacak. → Sonuçtan açılan notta ilgili satıra kadar ağaç açılsın, satır vurgulansın ve odaklansın. Sonuçlara "Arşivde" ve "Tamamlandı" etiketleri eklensin. Kapsam her yerde aynı olsun ya da mobilde "bu projede / her yerde" seçeneği bulunsun. Çipler yatay kaydırılsın ya da "Proje ▾" açılır listesi kullanılsın. *(Search, MProject)*
6. **Proje ayarlarında çelişki ve ani değişiklikler.** İki yönetici (Süleyman, Ayşe) olduğu halde "Ayrıl" düğmesi pasif ve "Son yönetici olduğun için…" yazıyor. Kendi satırındaki çıkarma (×) düğmesi açıklamasız pasif. Rol `select`'i değiştiği anda uygulanıyor gibi; kendini yöneticiden düşürmek için onay yok. "Bu adresle bir hesap var: Deniz Öztürk" mesajı adı da açığa vuruyor, oysa plan dizinde aramayı bilerek dışarıda bırakmış. → Ayrıl koşulu doğru hesaplansın. Kendi satırında × yerine "Ayrıl" bağlantısı gösterilsin. Kendini düşürmeye ve üye çıkarmaya onay istensin; diğer rol değişiklikleri için toast + geri al yeterli. Hesap kontrolünde ad gösterilmesin, "Bu adres kayıtlı" yeterli. Rol adlarının yanında küçük bir "?" ile rol tablosu gösterilsin. *(ProjectSettings)* Sezgiseller: tutarlılık, hata önleme.
7. **Sürüm geçmişinde önizleme ve geri yükleme belirsiz.** "Bir sürümü seçince notta önizlenir" deniyor ama önizleme hâli, önizlemeden çıkış ve neyin değiştiği (fark) çizilmemiş. Geri yüklemenin şimdiki hâli silip silmediği yazmıyor. → Seçilen sürüm sağ panelde salt okunur önizlensin; eklenen/silinen görevler renkle ayrılsın. Düğmenin altında "Şu anki sürüm de geçmişte kalır" notu bulunsun. Geri yükleme yeni bir sürüm olarak kaydedilsin ve toast ile geri alınabilsin. *(Dialogs)* Sezgisel: kontrol ve geri alma.
8. **İlk not akışı yarım.** "Not al…" alanı tıklanınca açılan hâl (başlık + gövde + renk + kapat/kaydet) çizilmemiş. Kaydetmenin otomatik mi, dışarı tıklayınca mı olacağı belli değil. Kayıt → doğrulama → ilk açılış zincirinde "e-postan doğrulandı" sonrası iniş ekranı da yok. → Açılmış oluşturucu çizilsin; dışarı tıklayınca kaydetme ve boşsa vazgeçme davranışı belirtilsin. Doğrulama sonrası boş durum (States) ilk girişte "Not al" alanına odaklansın. *(Main, Auth, States)*
9. **Masaüstünde çıkış yapma yolu yok.** Avatar doğrudan Ayarlar'a gidiyor; Ayarlar'da "Çıkış yap" yok. Bu düğme yalnız MSettings'te var. → Avatar menüsü eklensin (Ayarlar, Tema, Çıkış yap) ya da masaüstü Ayarlar'a da Çıkış konsun. *(Main, Settings)* Sezgisel: tutarlılık.
10. **Kart kurallarında tutarsızlık.** Plana göre tamamlanan görevler kartta görünmez, ama Archive'daki "Okul kayıt evrakları" kartında üstü çizili, dolu kutular var. Notifications ve TextNote arka planındaki kartlar Main'deki kartlardan farklı biçimde ("·" ile birleştirilmiş tek satır) çizilmiş. Trash'teki yapılacaklar kartının kutuları tıklanabilir görünüyor. → Kart bileşeni her yerde tek olsun. Arşiv ve çöpte kutular pasif (soluk) çizilsin. *(Archive, Trash, Notifications)*
11. **Çöp görünürlüğü ve görüntüleyici.** Trash "Bu projenin çöpünü yönetici ve düzenleyiciler görür" diyor; bu kural planda yok. Görüntüleyici Çöp sekmesine tıklayınca ne göreceği belirsiz. → Görüntüleyicide Çöp sekmesi gizlensin ya da "Çöpü yalnızca düzenleyiciler görür" diyen bir boş durum gösterilsin. Kural plana da işlensin. *(Trash, States)*
12. **Not üst bilgisi kesiliyor.** TodoNote alt çubuğunda "Ayşe Demir oluşturdu · Son düzenleyen M…" metni 1440 px'te bile kesiliyor ve tam metin yalnız `title` ile okunabiliyor. → Bu bilgi başlık altına küçük bir satır olarak ya da "Diğer" menüsüne alınsın. *(TodoNote)*
13. **Bildirimlerde eylem eksikleri.** Hatırlatıcı satırında "Notu aç" yok (planda var); rol değişikliği için seçilen katman simgesi anlamsız; "Yöneticiler 7 gün içinde geri alabilir" metni yönetici olmayana bir şey yaptırmıyor. → Hatırlatıcıya "Notu aç" bağlantısı eklensin. Rol simgesi kalkan ya da kişi+anahtar olsun. Alıcı yönetici değilse metin "Proje 8 Kasım'a kadar geri alınabilir" gibi bilgi verici olsun. *(Notifications)*

---

## 4. Küçük

- "?" boş görev başlığında kısayol kartını açıyor. Bu, planın "başlıkta hiçbir karakter özel anlam taşımaz" kuralıyla çelişiyor ve soru işaretiyle başlayan görev yazılamıyor. → Yalnız Ctrl+/ kullanılsın ya da "?" yalnızca odak liste dışındayken çalışsın. *(TodoNote)*
- Kısayol kartı her yerde "Ctrl" yazıyor, kod ise `metaKey`'i de kabul ediyor. Mac'te ⌘ gösterilsin. Ctrl+D (yer imi) ve Ctrl+Shift+A (Chrome sekme arama, Firefox eklentiler) tarayıcı kısayollarıyla çakışıyor. Firefox'ta Ctrl+Shift+A sayfa tarafından ezilemeyebilir; uygulamada test edilmeli, gerekirse yedek bir kısayol atanmalı.
- Satırdaki kutu ve düğmelerin aria-label'ları görev adını içermiyor ("Tamamlandı olarak işaretle", "Tarih ver"). Ekran okuyucuda hepsi aynı duyuluyor. → "‘SEO kontrolleri’ tamamlandı olarak işaretle" gibi olsun.
- Görev başlığında `.ttl:focus{outline:0}`; odak yalnız satır zemininin hafif değişmesiyle belli oluyor (hover rengiyle aynı). Klavye odağı için belirgin bir sol çizgi ya da halka eklensin.
- Not diyaloğunda `aria-modal` yok; Escape ile kapanma ve odak hapsi tanımlanmamış (TodoNote, TextNote).
- Main'deki kartlar `article` olarak çizilmiş, odaklanabilir bir bağlantıları yok. Uygulamada kartların klavyeyle açılabilir olması ve hover ile beliren kart eylemlerinin focus-within ile de görünmesi gerekiyor.
- Girdi kenarlığı (#E4E2DC) beyaz zeminde 1,3:1. Form alanlarının sınırı için 3:1 hedeflenmeli (WCAG 1.4.11). Beyaz kartın zemine kontrastı da 1,08:1; kart yalnızca bu zayıf kenarlıkla ayrılıyor.
- "Kaldır" iki yerde belirsiz: profil fotoğrafı ve tarih seçici. Sırasıyla "Fotoğrafı kaldır" ve "Tarihleri temizle" olsun.
- 404 metnindeki "proje kapatılmış" ifadesi ürün diliyle uyuşmuyor (projede kapatma yok, silme var). "Proje silinmiş" olsun.
- Kayıt formunda görünür bir "Robot doğrulaması (Cloudflare Turnstile)" kutusu var; plan görünmez doğrulama diyor. Şifre alanlarında göster/gizle düğmesi yok. "Kullanım koşulları" bağlantısız.
- Ayarlar'daki "Davet e-postası" anahtarı, planın "e-posta yalnızca davet…" kuralıyla birlikte düşünülünce davet e-postasının kapatılabildiğini gösteriyor; bu bilinçli bir karar mı, netleştirilsin. "Google hesabı · Bağlantıyı kaldır": hesapta şifre yoksa kullanıcı kendini dışarıda bırakabilir. Önce şifre belirleme istensin.
- MTodo'nun üst çubuğunda Arşivle yok, MText'te var. İki not türünün mobil başlık eylemleri aynı olsun.
- MProject'te "Davet gönder" düğmesi yok, yalnız avatar yığını ayarlara gidiyor. Yöneticiye mobilde de görünür bir davet eylemi verilsin.
- Arama sayfası kenar çubuğunu varsayılan olarak daraltıyor (`sidebar: collapsed`). Sayfa değişince düzen zıplıyor; kullanıcının seçtiği hâl korunsun.
- Proje başlığındaki "Yönetici" rozeti açıklamasız. Üstüne gelince/dokununca rolün yetkileri kısaca gösterilsin.
- Davet kabul edilince "Kabul et" doğrudan projeye gidiyor; bu iyi. "Reddet" için geri alma ya da onay yok; yanlış tıklamada davet kayboluyor.

---

## 5. İyi çalışanlar

- Proje/rol kurallarının kullanıldığı yerde anlatılması: taşıma listesinde "Görüntüleyici, not ekleyemez"; davette "Yalnızca Sukano hesabı olan kişiler…"; bekleyen davette "12 gün sonra geçersiz"; çöpte "Mehmet Kaya çöpe attı · 2 gün sonra silinir"; silinmiş proje bandında kalan gün.
- Görev satırının sade varsayılanı: kutucuk + başlık, sağda sessiz ipuçları, geçmiş tarih için kırmızı çip, "Bugün" sözcüğü.
- Boş satırdaki yer tutucu "Görev yaz · Enter yeni görev · Tab alt görev" ve "?"/Ctrl+/ ile açılan kısayol kartı (kart açılınca odak ona gidiyor, kapanınca geri dönüyor).
- İki yuvalı tarih seçicide aralığın takvimde görselleşmesi; saat ve "Hatırlat" anahtarının, bitiş tarihi yokken pasif kalması.
- Silme hiyerarşisinin net olması: arşiv ≠ çöp ≠ kalıcı sil; "Tehlikeli bölge" ayrımı; hesap silmede tek yönetici olunan projenin adıyla listelenmesi.
- Görüntüleyici için üstte kilit simgeli açıklama bandı ve soluk kutular.
- Mobilde 44 px'lik üst çubuk düğmeleri, klavye üstü görev araç çubuğu ve tek elle erişilebilen alt "Not al" bölgesi.
- Açık ve koyu temada metin kontrastları 4,6:1'in üzerinde (muted/kart renkleri dahil).

---

## 6. Uygulama aşamasında dikkat (tasarımda görünmeyenler)

- **Geri al süresi:** Arşiv, çöp, taşıma, tamamlama ve "Tamamlananları sil" için 6–10 sn'lik toast. Not içinde Ctrl+Z, yapılacaklarda yapısal işlemleri (girinti, taşıma, silme) de kapsamalı. Ortak düzenlemede yalnız kişinin kendi işlemlerini geri almalı.
- **Bildirim izni isteme zamanı:** Girişte değil, kullanıcı ilk kez hatırlatıcı kurduğunda ya da göreve atandığında, önce uygulama içi bir açıklama ("Hatırlatıcıların bu cihazda çalması için izin ver") gösterilerek. Reddedildiyse Ayarlar'daki anahtarlar "Tarayıcıda engelli · nasıl açılır" durumunu göstermeli. iOS'ta push yalnız PWA kurulunca çalışır; PWA ipucu bu bağlamda (ilk hatırlatıcıdan sonra) gösterilmeli.
- **Boş durumlar:** Proje (henüz not yok + "Üyeleri davet et"), Arşiv, Çöp ("Çöp boş · notlar 7 gün burada kalır"), Davetler, Bildirimler, arama sonuçsuz ("Arşiv dahil arandı"), görüntüleyici için boş proje, yapılacaklar notunda ilk görev satırı.
- **Yükleme:** Izgara için iskelet kartlar. Not açılırken Yjs eşitlemesi bitmeden düzenlemeye izin verilmemesi ya da "eşitleniyor" göstergesi. 10 MB dosya yüklemede ilerleme, iptal ve hata (boyut aşımı, tür) durumları.
- **Hata metinleri:** Davette "Bu adresle hesap yok, önce kayıt olması gerekiyor" (ad sızdırmadan). Doğrulanmamış hesaba davet. Süresi dolmuş/geri çekilmiş davet bağlantısı. Giriş hatası (e-posta/şifre ayrımı yapmadan). Hız sınırı ("Çok fazla deneme, 1 dk sonra tekrar"). Doğrulama bağlantısını tekrar göndermede bekleme süresi sayacı.
- **Yetki değişince canlı durum:** Not açıkken rol görüntüleyiciye düşerse ya da kişi projeden çıkarılırsa ne olacağı: düzenleme hemen kilitlenmeli, kaydedilmemiş başlık kaybolmamalı, bant çıkmalı. Not başkası tarafından çöpe atılırsa açık diyaloğun davranışı tanımlanmalı.
- **Ortak düzenleme çakışmaları:** "Son yazan kazanır" görev başlığında, kullanıcının yazdığı metin ezildiğinde kısa bir "Zeynep bu görevi değiştirdi" uyarısı. Başkasının tamamladığı görev, kullanıcı bakarken animasyonla insin ve kimin tamamladığı gösterilsin (`completed_by` zaten var).
- **Açık/kapalı durumu** kişiye ve cihaza özel: yeni açılan alt ağaçların varsayılanı, arama derin bağlantısıyla açılan dalların kalıcı olup olmayacağı.
- **Çevrimdışı:** Banttaki "düzenleme bağlantı gelince açılır" metnine ek olarak, kutucuk ve "Not al" alanı da devre dışı görünmeli. Bağlantı dönünce bant "Yeniden bağlandı" ile kapanmalı.
- **Saat dilimi:** Hatırlatıcı seçicide saat dilimi tarayıcıdan farklıysa (ör. yurt dışında) "İstanbul saatiyle" gibi bir not. Geçmiş bir saate hatırlatıcı kurulmasını engelleme.
- **Çöp 7 gün:** Çöpe atma toast'ında ve çöpteki her kartta kalan gün (var) gösterilmeli. "Çöpü boşalt" için kaç notun silineceğini sayan bir onay.
- **Proje silme:** Onay için proje adını yazdırma. Diğer yöneticilere ve üyelere giden bildirim. Silinmiş projenin sol menüde yöneticiye "silindi · 5 gün" rozetiyle görünmesi.
- **Metin ↔ yapılacaklar dönüşümü:** Biçimlendirme ve eklerin (yalnız metin notunda var) dönüşümde ne olacağı. Ek dosyalı bir notu yapılacaklara çevirirken uyarı.
- **Sürükleme:** Klavye alternatifi var (Alt+↑/↓). Seviyeler arası sürüklemede "altına bırak" göstergesi. Mobilde uzun basma ile kaydırma çakışması.
