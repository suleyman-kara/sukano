/**
 * Worker çalışma zamanının `node:async_hooks` alt kümesi (`nodejs_compat`). Worker tip
 * yapılandırmaları Node tiplerini yüklemez; yalnızca kullanılan yüzey tanımlanır
 * (bkz. `app/lib/db-timing.server.ts`). Birim testleri `@types/node` ile derlenir.
 */
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}
