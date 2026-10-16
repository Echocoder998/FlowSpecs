import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, isDatabaseConfigured, normalizeRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_CONFIGURED = "Database is not configured. Set DATABASE_URL.";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function json(value: unknown, fallback: unknown) {
  return JSON.stringify(value ?? fallback);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Database request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 500 });
  try {
    await ensureSchema();
    const sql = getDb()!;
    const rows = await sql`select * from datasheets order by updated_at desc`;
    return NextResponse.json({ datasheets: rows.map((row) => normalizeRow(row)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 500 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body.questionnaire) {
      return NextResponse.json({ error: "Missing questionnaire." }, { status: 400 });
    }
    await ensureSchema();
    const sql = getDb()!;
    const rows = await sql`
      insert into datasheets (title, file_name, profile, part_number, confidence_label, questionnaire, answers)
      values (
        ${text(body.title, "Untitled datasheet")},
        ${text(body.file_name)},
        ${json(body.profile, {})}::jsonb,
        ${text(body.part_number)},
        ${text(body.confidence_label, "Pending")},
        ${json(body.questionnaire, {})}::jsonb,
        ${json(body.answers, {})}::jsonb
      )
      returning *`;
    return NextResponse.json({ datasheet: normalizeRow(rows[0]) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 500 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = text(body.id);
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    await ensureSchema();
    const sql = getDb()!;
    const rows = await sql`
      update datasheets set
        title = ${text(body.title, "Untitled datasheet")},
        file_name = ${text(body.file_name)},
        profile = ${json(body.profile, {})}::jsonb,
        part_number = ${text(body.part_number)},
        confidence_label = ${text(body.confidence_label, "Pending")},
        questionnaire = ${json(body.questionnaire, {})}::jsonb,
        answers = ${json(body.answers, {})}::jsonb,
        updated_at = now()
      where id = ${id}
      returning *`;
    if (!rows.length) return NextResponse.json({ error: "Datasheet not found." }, { status: 404 });
    return NextResponse.json({ datasheet: normalizeRow(rows[0]) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 500 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await ensureSchema();
    const sql = getDb()!;
    await sql`delete from datasheets where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
