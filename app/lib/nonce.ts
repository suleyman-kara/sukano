import { createContext, useContext } from "react";

/**
 * CSP nonce'u (bkz. `app/domain/security/headers.ts`). Sunucuda `entry.server.tsx` her
 * istekte sağlar; satır içi betikler (`<script nonce>`) bununla çalışır. Tarayıcıda boştur:
 * tarayıcı nonce özniteliğini zaten gizler, hidrasyon onu yeniden yazmaz.
 */
export const NonceContext = createContext<string | undefined>(undefined);

export function useNonce(): string | undefined {
  return useContext(NonceContext);
}
