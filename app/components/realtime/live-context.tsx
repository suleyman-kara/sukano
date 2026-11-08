import { createContext, useContext, useMemo } from "react";
import type { PresenceUser } from "~/domain/realtime/presence";

/**
 * Canlı katman yapılandırması. Varsayılan **kapalı**: sağlayıcı olmadan (bileşen testleri,
 * kabuksuz sayfalar) not ve ızgara eski (yalnızca HTTP) davranışıyla çalışır. Uygulama
 * kökü (`app/root.tsx`) oturum varsa `enabled` ve kişiyle sarar.
 */
export type LiveConfig = {
  enabled: boolean;
  /** Oturumdaki kişi (varlıkta kendi bilgin; sunucu yine oturumdakiyle doğrular). */
  me: PresenceUser | null;
};

const LiveContext = createContext<LiveConfig>({ enabled: false, me: null });

export function LiveConfigProvider({
  enabled,
  me,
  children,
}: LiveConfig & { children: React.ReactNode }) {
  const value = useMemo(
    () => ({ enabled: enabled && me !== null, me }),
    // `me` alanları değişmedikçe aynı nesne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, me?.id, me?.name, me?.color, me?.avatarUrl],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveConfig(): LiveConfig {
  return useContext(LiveContext);
}
