import { drizzle } from "drizzle-orm/d1";
import { instrumentD1 } from "~/lib/db-timing.server";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * D1 bağlamasından Drizzle istemcisi (istek başına ucuzdur). Sorgular sayılır ve
 * ölçülür (`Server-Timing`, bkz. `app/lib/db-timing.server.ts`).
 */
export function createDb(d1: D1Database) {
  return drizzle(instrumentD1(d1), { schema });
}

export { schema };
