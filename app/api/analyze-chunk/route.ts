import { NextRequest, NextResponse } from "next/server";
import { createStructuredResponse, sanitizeText } from "@/lib/openai";
import { chunkAnalysisSchema } from "@/lib/schemas";
import type { ChunkAnalysis, DatasheetProfile, TextChunk } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_CHUNK_CHARS = 42000;

function isTextChunk(value: unknown): value is TextChunk {
  const chunk = value as TextChunk;
  return (
    typeof chunk?.id === "string" &&
    typeof chunk?.startPage === "number" &&
    typeof chunk?.endPage === "number" &&
    typeof chunk?.text === "string"
  );
}

function profileLine(profile?: DatasheetProfile) {
  if (!profile) return "No operator-supplied context.";

  return [
    profile.manufacturer ? `Manufacturer: ${profile.manufacturer}` : "",
    profile.productFamily ? `Product family: ${profile.productFamily}` : "",
    profile.application ? `Application: ${profile.application}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      chunk?: TextChunk;
      profile?: DatasheetProfile;
    };

    if (!isTextChunk(body.chunk)) {
      return NextResponse.json({ error: "A valid text chunk is required." }, { status: 400 });
    }

    const chunk = body.chunk;
    const text = sanitizeText(chunk.text, MAX_CHUNK_CHARS);

    if (text.trim().length < 50) {
      const empty: ChunkAnalysis = {
        chunkId: chunk.id,
        pageRange: `${chunk.startPage}-${chunk.endPage}`,
        productFamilies: [],
        orderingPatterns: [],
        candidateFields: [],
        constraints: [],
        warnings: ["This page range did not contain enough extractable text."],
        sourceQuality: "low"
      };
      return NextResponse.json({ analysis: empty });
    }

    const analysis = await createStructuredResponse<ChunkAnalysis>({
      name: "datasheet_chunk_analysis",
      schema: chunkAnalysisSchema,
      maxOutputTokens: 7000,
      reasoningEffort: "low",
      timeoutMs: 105000,
      system:
        "You extract industrial datasheet ordering information into strict JSON. Focus on model-number builders, option codes, configurable dimensions, ratings, materials, electrical ranges, approvals, connection styles, accessories, and constraints that affect valid part numbers. Do not invent codes. Prefer exact labels and short evidence. Every sourcePages entry must refer to a page in the supplied range.",
      user: [
        "Operator context:",
        profileLine(body.profile),
        "",
        `Chunk: ${chunk.id}`,
        `Pages: ${chunk.startPage}-${chunk.endPage}`,
        "",
        "Return JSON only. Use stable snake_case field ids. If a table clearly maps choices to part-number code characters, put the code in each option.code. If the chunk contains specs but no ordering logic, extract only fields that are likely required for configuration and include a warning.",
        "",
        "Datasheet text:",
        text
      ].join("\n")
    });

    analysis.chunkId = chunk.id;
    analysis.pageRange = `${chunk.startPage}-${chunk.endPage}`;

    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected analysis error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
