/** Kabuğun ihtiyaç duyduğu en küçük veri şekilleri. Aşama 1'de oturum ve
 * veritabanından (loader) doldurulacak. */

export type ProjectColor = "turuncu" | "mavi" | "yesil" | "pembe" | "mor" | "sari" | "grimavi";

export type ShellUser = {
  /** Oturumdaki kişinin kimliği (canlı katman: varlık). Kabuksuz/boş veride yok. */
  id?: string;
  name: string;
  email: string;
  /** Avatar zemin rengi (beyaz metinle ≥ 4,5:1). */
  avatarColor: string;
  avatarUrl?: string | null;
};

export type ShellProject = {
  id: string;
  name: string;
  color: ProjectColor;
  /** İsteğe bağlı simge (emoji); yoksa baş harf. */
  emoji?: string | null;
  /** Kullanıcının bu projedeki rolü. */
  role?: "yonetici" | "duzenleyici" | "goruntuleyici";
};

export type ShellData = {
  user: ShellUser;
  projects: ShellProject[];
  /** Yönetici olunan silinmiş projeler ("Silinmiş projeler (n)"; 0 ise bağlantı gizli). */
  deletedProjectCount: number;
  pendingInviteCount: number;
  unreadNotificationCount: number;
  /** Kişinin saat dilimi (hatırlatıcı çipleri); yoksa İstanbul. */
  timeZone?: string;
  /** Ayarlar › "Hareketi azalt" (`<html data-motion>`); yoksa sistem. */
  motion?: "system" | "reduced" | "full";
};
