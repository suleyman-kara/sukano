/** Kabuğun ihtiyaç duyduğu en küçük veri şekilleri. Aşama 1'de oturum ve
 * veritabanından (loader) doldurulacak. */

export type ProjectColor = "turuncu" | "mavi" | "yesil" | "pembe" | "mor" | "sari" | "grimavi";

export type ShellUser = {
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
};

export type ShellData = {
  user: ShellUser;
  projects: ShellProject[];
  pendingInviteCount: number;
  unreadNotificationCount: number;
};
