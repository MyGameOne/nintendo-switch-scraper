import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export interface D1Database {
  prepare(query: string): {
    bind(...values: any[]): {
      first(): Promise<any>;
      all(): Promise<{ results: any[] }>;
      run(): Promise<any>;
    };
  };
}

export function createDbConnection(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DbConnection = ReturnType<typeof createDbConnection>;
