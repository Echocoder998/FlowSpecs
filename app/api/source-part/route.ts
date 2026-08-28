import { NextRequest, NextResponse } from "next/server";
import { formatMceLineCardLibrary, mceLineCardLibrarySource } from "@/lib/mce-line-card";
import { createStructuredResponse, sanitizeText } from "@/lib/openai";
import { partSourcingSchema } from "@/lib/schemas";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { formatVendorDirectory, mapRowToVendorDirectoryEntry, shortlistVendorDirectory } from "@/lib/vendor-directory";
import type { PartSourcingInput, PartSourcingResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_TEXT_CHARS = 70000;

function normalizeInput(input: unknown): PartSourcingInput {
  const body = (input || {}) as Partial<PartSourcingInput>;
  return {
    partNumber: typeof body.partNumber === "string" ? body.partNumber.trim() : "",
    description: typeof body.description === "string" ? body.description.trim() : "",
    fileName: typeof body.fileName === "string" ? body.fileName.trim() : "",
    fileText: typeof body.fileText === "string" ? body.fileText : ""
  };
}

export async function POST(request: NextRequest) {
  try {
    const input = normalizeInput(await request.json());

    if (!input.partNumber && !input.description && !input.fileText.trim()) {
      return NextResponse.json(
        { error: "Enter a part number, description, or upload a source file." },
        { status: 400 }
      );
    }

    const fileText = sanitizeText(input.fileText, MAX_FILE_TEXT_CHARS);

    let directoryText = "No vendor/branch/contact directory data has been uploaded yet.";
    if (isSupabaseAdminConfigured()) {
      const client = getSupabaseAdminClient()!;
      const { data } = await client.from("vendor_directory").select("*");
      const entries = (data || []).map(mapRowToVendorDirectoryEntry);
      const query = [input.partNumber, input.description, input.fileName].join(" ");
      directoryText = formatVendorDirectory(shortlistVendorDirectory(entries, query));
    }

    const result = await createStructuredResponse<PartSourcingResult>({
      name: "mce_part_sourcing",
      schema: partSourcingSchema,
      maxOutputTokens: 6500,
      reasoningEffort: "medium",
      timeoutMs: 105000,
      system:
        "You route industrial part sourcing requests to the most appropriate Motion & Control Enterprises (MCE) group, business unit, or line-card entry, and to a specific branch and contact when one is known. Use only the provided MCE line-card library as the source of truth for MCE capabilities. When the requested vendor or product matches an entry in the admin-uploaded vendor/branch/contact directory, prefer that entry's branch and populate branchName/contactName/contactEmail/contactPhone from it. If no directory entry matches, leave branchName/contactName/contactEmail/contactPhone as empty strings rather than guessing. Make a practical recommendation, include alternates when plausible, and be explicit about uncertainty. Do not claim inventory, price, lead time, or manufacturer authorization unless provided by the user.",
      user: [
        "MCE line-card library source:",
        mceLineCardLibrarySource,
        "",
        "MCE capabilities:",
        formatMceLineCardLibrary(),
        "",
        "Vendor/branch/contact directory (admin-uploaded reference data):",
        directoryText,
        "",
        "Requested item:",
        `Part number: ${input.partNumber || "Not provided"}`,
        `Description: ${input.description || "Not provided"}`,
        `Uploaded file: ${input.fileName || "None"}`,
        "",
        "Uploaded file text:",
        fileText || "No extracted file text.",
        "",
        "Return strict JSON. Pick one recommendedSource with fitScore from 0 to 1. Use businessUnit for the named MCE company or unit when the line card implies one, otherwise repeat the most specific group. Include 1 to 3 alternates when useful. In lineCardReferences, name the exact line-card entries or product categories you used."
      ].join("\n")
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected sourcing error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
