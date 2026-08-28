import { NextRequest, NextResponse } from "next/server";
import { createStructuredResponse, sanitizeText } from "@/lib/openai";
import { vendorDirectoryExtractionSchema } from "@/lib/schemas";
import type { VendorDirectoryExtractionResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT_CHARS = 70000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      fileName?: unknown;
      fileType?: unknown;
      extractedText?: unknown;
    };

    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileType = typeof body.fileType === "string" ? body.fileType.trim() : "";
    const extractedText = typeof body.extractedText === "string" ? body.extractedText : "";

    if (!extractedText.trim()) {
      return NextResponse.json({ error: "No extracted text to parse." }, { status: 400 });
    }

    const text = sanitizeText(extractedText, MAX_TEXT_CHARS);

    const result = await createStructuredResponse<VendorDirectoryExtractionResult>({
      name: "vendor_directory_extraction",
      schema: vendorDirectoryExtractionSchema,
      maxOutputTokens: 8000,
      reasoningEffort: "medium",
      timeoutMs: 105000,
      system:
        "You extract vendor/branch/contact directory rows from uploaded spreadsheet or document text for an industrial distributor (MCE). Each row maps a vendor or product line to the MCE group/business unit/line card that carries it, an MCE branch, and a named contact at that branch. Only extract information that is actually present in the text - leave a field as an empty string when it isn't stated. Do not invent contact names, emails, or phone numbers. If the same vendor appears with multiple branches or contacts, emit one row per distinct combination.",
      user: [
        `Uploaded file: ${fileName || "Unknown"} (${fileType || "unknown type"})`,
        "",
        "Extracted text (may be tab-separated spreadsheet rows or dumped document text):",
        text
      ].join("\n")
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected extraction error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
