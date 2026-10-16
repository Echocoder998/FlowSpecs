import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

let client: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

export function isDatabaseConfigured() {
  return Boolean(databaseUrl);
}

export function getDb() {
  if (!databaseUrl) return null;
  if (!client) client = neon(databaseUrl);
  return client;
}

// Creates the tables on first use so a fresh Neon database works without
// running any SQL by hand. Safe to run repeatedly.
export async function ensureSchema() {
  const sql = getDb();
  if (!sql) throw new Error("Database is not configured. Set DATABASE_URL.");
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists datasheets (
          id uuid primary key default gen_random_uuid(),
          title text not null,
          file_name text not null default '',
          profile jsonb not null default '{}'::jsonb,
          part_number text not null default '',
          confidence_label text not null default 'Pending',
          questionnaire jsonb not null,
          answers jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )`;
      await sql`
        create table if not exists vendor_directory (
          id uuid primary key default gen_random_uuid(),
          vendor_name text not null default '',
          product_or_category text not null default '',
          mce_group text not null default '',
          business_unit text not null default '',
          line_card text not null default '',
          branch_name text not null default '',
          contact_name text not null default '',
          contact_email text not null default '',
          contact_phone text not null default '',
          contact_title text not null default '',
          notes text not null default '',
          source_file text not null default '',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )`;
      await sql`
        create table if not exists admin_uploads (
          id uuid primary key default gen_random_uuid(),
          file_name text not null default '',
          file_type text not null default '',
          row_count integer not null default 0,
          status text not null default 'parsed',
          created_at timestamptz not null default now()
        )`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

// Converts Date values (timestamptz columns) to ISO strings so rows serialize cleanly.
export function normalizeRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out as T;
}
