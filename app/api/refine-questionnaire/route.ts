import { NextRequest, NextResponse } from "next/server";
import { createStructuredResponse, sanitizeText } from "@/lib/openai";
import { questionnaireRefinementSchema } from "@/lib/schemas";
import type {
  AnswerMap,
  ChunkAnalysis,
  DatasheetProfile,
  QuestionnaireModel,
  RefinementChatMessage
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_CONTEXT_CHARS = 140000;

type RefinementResponse = {
  assistantMessage: string;
  questionnaire: QuestionnaireModel;
};

function normalizeAnalyses(input: unknown): ChunkAnalysis[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => item && typeof item === "object") as ChunkAnalysis[];
}

function normalizeMessages(input: unknown): RefinementChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === "object")
    .map((item) => item as RefinementChatMessage)
    .filter(
      (item) =>
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .slice(-8);
}

function summarizeAnalyses(analyses: ChunkAnalysis[]) {
  return analyses.map((analysis) => ({
    chunkId: analysis.chunkId,
    pageRange: analysis.pageRange,
    productFamilies: analysis.productFamilies,
    orderingPatterns: analysis.orderingPatterns,
    candidateFields: analysis.candidateFields,
    constraints: analysis.constraints,
    warnings: analysis.warnings,
    sourceQuality: analysis.sourceQuality
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      message?: string;
      messages?: RefinementChatMessage[];
      questionnaire?: QuestionnaireModel;
      answers?: AnswerMap;
      analyses?: ChunkAnalysis[];
      profile?: DatasheetProfile;
      partNumber?: string;
      fileName?: string;
    };

    if (!body.questionnaire) {
      return NextResponse.json({ error: "A questionnaire is required." }, { status: 400 });
    }

    if (!body.message?.trim()) {
      return NextResponse.json({ error: "A refinement message is required." }, { status: 400 });
    }

    const context = sanitizeText(
      JSON.stringify({
        fileName: body.fileName || "",
        profile: body.profile,
        currentPartNumber: body.partNumber,
        currentAnswers: body.answers || {},
        currentQuestionnaire: body.questionnaire,
        sourceAnalyses: summarizeAnalyses(normalizeAnalyses(body.analyses)),
        recentChat: normalizeMessages(body.messages)
      }),
      MAX_CONTEXT_CHARS
    );

    const result = await createStructuredResponse<RefinementResponse>({
      name: "datasheet_questionnaire_refinement",
      schema: questionnaireRefinementSchema,
      maxOutputTokens: 10000,
      reasoningEffort: "medium",
      timeoutMs: 165000,
      system:
        "You refine industrial product configuration questionnaires from datasheet evidence and operator feedback. Return strict JSON. Update the questionnaire only where the user's instruction or source evidence supports a change. Preserve valid option codes, part-number segment references, page citations, and stable field ids unless a field is clearly wrong. Do not invent unsupported ordering codes. If the user asks for a correction that is not supported by evidence, add a review note and keep confidence lower.",
      user: [
        "User refinement request:",
        body.message,
        "",
        "Return an assistantMessage that briefly explains the changes, and return the complete revised questionnaire JSON.",
        "",
        "Current context:",
        context
      ].join("\n")
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected refinement error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
