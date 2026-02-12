import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.SUPABASE_DB_URL;

    this.pool = new Pool({
      connectionString,
      ssl: connectionString ? { rejectUnauthorized: false } : undefined,
    });
  }

  query<T = unknown>(text: string, params: unknown[] = []) {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(runner: (query: <R = unknown>(text: string, params?: unknown[]) => Promise<QueryResult<R>>) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await runner((text, params = []) => client.query(text, params));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
