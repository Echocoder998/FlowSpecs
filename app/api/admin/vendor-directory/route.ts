import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { mapRowToVendorDirectoryEntry } from "@/lib/vendor-directory";
import type { VendorDirectoryDraftEntry } from "@/lib/types";

export const runtime = "nodejs";

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
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const client = getSupabaseAdminClient()!;
  const { data, error } = await client
    .from("vendor_directory")
    .select("*")
    .order("vendor_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: (data || []).map(mapRowToVendorDirectoryEntry) });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
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

  const client = getSupabaseAdminClient()!;
  const { data, error } = await client
    .from("vendor_directory")
    .insert(
      entries.map((entry) => ({
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
      }))
    )
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await client.from("admin_uploads").insert({
    file_name: fileName,
    file_type: fileType,
    row_count: entries.length,
    status: "committed"
  });

  return NextResponse.json({ entries: (data || []).map(mapRowToVendorDirectoryEntry) });
}

export async function DELETE(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const client = getSupabaseAdminClient()!;
  const { error } = await client.from("vendor_directory").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
