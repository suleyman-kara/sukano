import { LogOut, Palette, Settings } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";
import { Avatar } from "~/components/avatar";
import { ThemeRadioItems } from "~/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { ShellUser } from "./types";

/** Avatar menüsü: ad, e-posta, Tema, Ayarlar, Çıkış yap. */
export function AccountMenu({ user }: { user: ShellUser }) {
  // Çıkış tam sayfa POST ile yapılır: istemcideki tüm durum da temizlenir.
  const signOutForm = useRef<HTMLFormElement>(null);
  return (
    <DropdownMenu>
      <form ref={signOutForm} method="post" action="/cikis" hidden />
      <DropdownMenuTrigger
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-9"
        title={user.name}
      >
        {/* Ad içerikten gelir; baş harfler süs (aria-hidden), aria-label yok
            (axe label-content-name-mismatch). */}
        <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} size={34} />
        <span className="sr-only">Hesap menüsü</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-[260px] rounded-xl p-1.5">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} size={36} />
          <span className="flex min-w-0 flex-col">
            <b className="font-semibold">{user.name}</b>
            <small className="truncate text-xs text-muted-foreground">{user.email}</small>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-3 px-2.5 py-2 font-medium">
            <Palette className="size-(--menu-icon) text-muted-foreground" aria-hidden="true" />
            Tema
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <ThemeRadioItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild className="gap-3 px-2.5 py-2 font-medium">
          <Link to="/ayarlar">
            <Settings className="size-(--menu-icon) text-muted-foreground" aria-hidden="true" />
            Ayarlar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-3 px-2.5 py-2 font-medium"
          onSelect={() => signOutForm.current?.requestSubmit()}
        >
          <LogOut className="size-(--menu-icon) text-muted-foreground" aria-hidden="true" />
          Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
