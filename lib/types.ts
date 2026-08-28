export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type TextChunk = {
  id: string;
  startPage: number;
  endPage: number;
  text: string;
};

export type FieldKind =
  | "select"
  | "multi_select"
  | "number"
  | "text"
  | "boolean";

export type DatasheetOption = {
  label: string;
  value: string;
  code: string;
  description: string;
  sourcePages: number[];
};

export type QuestionnaireField = {
  id: string;
  label: string;
  prompt: string;
  kind: FieldKind;
  required: boolean;
  unit: string;
  placeholder: string;
  options: DatasheetOption[];
  dependencies: string[];
  sourcePages: number[];
  confidence: number;
};

export type PartNumberSegment = {
  label: string;
  fieldId: string;
  literal: string;
  separator: string;
  fallback: string;
};

export type PartNumberModel = {
  familyLabel: string;
  pattern: string;
  segments: PartNumberSegment[];
  notes: string[];
};

export type ChunkAnalysis = {
  chunkId: string;
  pageRange: string;
  productFamilies: string[];
  orderingPatterns: {
    label: string;
    pattern: string;
    evidence: string;
    sourcePages: number[];
  }[];
  candidateFields: QuestionnaireField[];
  constraints: string[];
  warnings: string[];
  sourceQuality: string;
};

export type QuestionnaireModel = {
  title: string;
  summary: string;
  fields: QuestionnaireField[];
  partNumberModel: PartNumberModel;
  constraints: string[];
  reviewNotes: string[];
};

export type DatasheetProfile = {
  manufacturer: string;
  productFamily: string;
  application: string;
};

export type AnswerMap = Record<string, string | string[] | boolean | number>;

export type RefinementChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PartSourcingInput = {
  partNumber: string;
  description: string;
  fileName: string;
  fileText: string;
};

export type PartSourceRecommendation = {
  mceGroup: string;
  businessUnit: string;
  lineCard: string;
  fitScore: number;
  rationale: string;
  supportingSignals: string[];
  caveats: string[];
  branchName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

export type PartSourcingResult = {
  summary: string;
  recommendedSource: PartSourceRecommendation;
  alternates: PartSourceRecommendation[];
  nextQuestions: string[];
  lineCardReferences: string[];
};

export type VendorDirectoryEntry = {
  id: string;
  vendorName: string;
  productOrCategory: string;
  mceGroup: string;
  businessUnit: string;
  lineCard: string;
  branchName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
  notes: string;
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
};

export type VendorDirectoryDraftEntry = Omit<
  VendorDirectoryEntry,
  "id" | "createdAt" | "updatedAt"
>;

export type VendorDirectoryExtractionResult = {
  entries: VendorDirectoryDraftEntry[];
};
