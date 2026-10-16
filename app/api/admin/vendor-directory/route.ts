import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, isDatabaseConfigured, normalizeRow } from "@/lib/db";
import { mapRowToVendorDirectoryEntry } from "@/lib/vendor-directory";
import type { VendorDirectoryDraftEntry } from "@/lib/types";

export const runtime = "nodejs";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Database request failed.";
}

function normalizeDraftEntry(input: unknown): VendorDirectoryDraftEntry {
  const body = (input || {}) as Partial<VendorDirectoryDraftEntry>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  return {
    vendorName: text(body.vendorName),
    productOrCategory: text(body.productOrCategory),
    mceGroup: text(body.mceGroup),
    businessUnit: text(body.businessUnit),
    lineCard: text(body.lineCard),
    branchName: text(body.branchName),
    contactName: text(body.contactName),
    contactEmail: text(body.contactEmail),
    contactPhone: text(body.contactPhone),
    contactTitle: text(body.contactTitle),
    notes: text(body.notes),
    sourceFile: text(body.sourceFile)
  };
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured. Set DATABASE_URL." }, { status: 500 });
  }

  try {
    await ensureSchema();
    const sql = getDb()!;
    const rows = await sql`select * from vendor_directory order by vendor_name asc`;
    return NextResponse.json({
      entries: rows.map((row) => mapRowToVendorDirectoryEntry(normalizeRow(row)))
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured. Set DATABASE_URL." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    entries?: unknown;
    fileName?: unknown;
    fileType?: unknown;
  };

  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  const entries = rawEntries.map(normalizeDraftEntry).filter((entry) => entry.vendorName);

  if (!entries.length) {
    return NextResponse.json({ error: "No valid directory entries to save." }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const fileType = typeof body.fileType === "string" ? body.fileType.trim() : "";

  const records = entries.map((entry) => ({
    vendor_name: entry.vendorName,
    product_or_category: entry.productOrCategory,
    mce_group: entry.mceGroup,
    business_unit: entry.businessUnit,
    line_card: entry.lineCard,
    branch_name: entry.branchName,
    contact_name: entry.contactName,
    contact_email: entry.contactEmail,
    contact_phone: entry.contactPhone,
    contact_title: entry.contactTitle,
    notes: entry.notes,
    source_file: entry.sourceFile || fileName
  }));

  try {
    await ensureSchema();
    const sql = getDb()!;
    const rows = await sql`
      insert into vendor_directory (
        vendor_name, product_or_category, mce_group, business_unit, line_card, branch_name,
        contact_name, contact_email, contact_phone, contact_title, notes, source_file
      )
      select
        vendor_name, product_or_category, mce_group, business_unit, line_card, branch_name,
        contact_name, contact_email, contact_phone, contact_title, notes, source_file
      from jsonb_to_recordset(${JSON.stringify(records)}::jsonb) as r(
        vendor_name text, product_or_category text, mce_group text, business_unit text,
        line_card text, branch_name text, contact_name text, contact_email text,
        contact_phone text, contact_title text, notes text, source_file text
      )
      returning *`;

    await sql`
      insert into admin_uploads (file_name, file_type, row_count, status)
      values (${fileName}, ${fileType}, ${entries.length}, 'committed')`;

    return NextResponse.json({
      entries: rows.map((row) => mapRowToVendorDirectoryEntry(normalizeRow(row)))
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured. Set DATABASE_URL." }, { status: 500 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getDb()!;
    await sql`delete from vendor_directory where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
