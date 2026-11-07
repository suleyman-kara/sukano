import type { ShellData } from "~/components/shell/types";

/**
 * GEÇİCİ yer tutucu veri. Oturum ve veritabanı gelene kadar kabuğu
 * göstermek için kullanılır; Aşama 1'de root/home loader'ı gerçek veriyle
 * değiştirecek ve bu dosya silinecek.
 */
export const placeholderShell: ShellData = {
  user: {
    name: "Ayşe Yılmaz",
    email: "ayse@test.sukano",
    avatarColor: "#597895",
  },
  projects: [
    { id: "web-sitesi-yenileme", name: "Web Sitesi Yenileme", color: "turuncu" },
    { id: "ev-tasinma", name: "Ev Taşınma", color: "mavi" },
    { id: "kitap-kulubu", name: "Kitap Kulübü", color: "yesil" },
  ],
  pendingInviteCount: 1,
  unreadNotificationCount: 2,
};
