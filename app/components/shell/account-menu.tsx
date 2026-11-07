import { LogOut, Palette, Settings } from "lucide-react";
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-9"
        aria-label="Hesap menüsü"
        title={user.name}
      >
        <Avatar name={user.name} color={user.avatarColor} src={user.avatarUrl} size={34} />
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
            <Palette className="size-[18px] text-muted-foreground" aria-hidden="true" />
            Tema
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <ThemeRadioItems />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild className="gap-3 px-2.5 py-2 font-medium">
          <Link to="/ayarlar">
            <Settings className="size-[18px] text-muted-foreground" aria-hidden="true" />
            Ayarlar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-3 px-2.5 py-2 font-medium">
          {/* Aşama 1: Better Auth oturumunu kapatan POST eylemine bağlanacak. */}
          <Link to="/giris">
            <LogOut className="size-[18px] text-muted-foreground" aria-hidden="true" />
            Çıkış yap
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
