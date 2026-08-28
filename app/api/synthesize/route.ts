import { NextRequest, NextResponse } from "next/server";
import { createStructuredResponse, sanitizeText } from "@/lib/openai";
import { questionnaireSchema } from "@/lib/schemas";
import type { ChunkAnalysis, DatasheetProfile, QuestionnaireModel } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_ANALYSIS_CHARS = 140000;

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

function normalizeAnalyses(input: unknown): ChunkAnalysis[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => item && typeof item === "object") as ChunkAnalysis[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      analyses?: ChunkAnalysis[];
      profile?: DatasheetProfile;
    };

    const analyses = normalizeAnalyses(body.analyses);
    if (!analyses.length) {
      return NextResponse.json({ error: "At least one chunk analysis is required." }, { status: 400 });
    }

    const analysisJson = sanitizeText(JSON.stringify(analyses), MAX_ANALYSIS_CHARS);

    const questionnaire = await createStructuredResponse<QuestionnaireModel>({
      name: "datasheet_questionnaire",
      schema: questionnaireSchema,
      maxOutputTokens: 9000,
      reasoningEffort: "medium",
      timeoutMs: 165000,
      system:
        "You design industrial product configuration questionnaires from extracted datasheet evidence. Return strict JSON. Merge duplicates, preserve part-number codes, avoid speculative options, and keep page citations. The questionnaire must help an end user create a valid part number from a datasheet.",
      user: [
        "Operator context:",
        profileLine(body.profile),
        "",
        "Synthesis rules:",
        "- Create 6 to 20 fields unless the evidence supports fewer.",
        "- Put the most important part-number-driving fields first.",
        "- Use select or multi_select when options/codes are known.",
        "- Use number/text only when the datasheet requires free entry or dimensional values.",
        "- Keep each field id stable and snake_case.",
        "- partNumberModel.segments must reference field ids from fields when a choice drives a code.",
        "- For fixed prefixes or separators, use literal and leave fieldId empty.",
        "- Use fallback placeholders like ___, X, or ? when the datasheet does not expose a code.",
        "- Include review notes for ambiguous, missing, or image-only evidence.",
        "",
        "Chunk analyses:",
        analysisJson
      ].join("\n")
    });

    return NextResponse.json({ questionnaire });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected synthesis error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
