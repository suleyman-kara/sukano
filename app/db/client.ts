import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** D1 bağlamasından Drizzle istemcisi (istek başına ucuzdur). */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export { schema };
