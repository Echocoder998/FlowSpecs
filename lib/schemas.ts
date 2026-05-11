const optionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    value: { type: "string" },
    code: { type: "string" },
    description: { type: "string" },
    sourcePages: {
      type: "array",
      items: { type: "integer" }
    }
  },
  required: ["label", "value", "code", "description", "sourcePages"]
};

const questionnaireFieldSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    prompt: { type: "string" },
    kind: {
      type: "string",
      enum: ["select", "multi_select", "number", "text", "boolean"]
    },
    required: { type: "boolean" },
    unit: { type: "string" },
    placeholder: { type: "string" },
    options: {
      type: "array",
      items: optionSchema
    },
    dependencies: {
      type: "array",
      items: { type: "string" }
    },
    sourcePages: {
      type: "array",
      items: { type: "integer" }
    },
    confidence: { type: "number" }
  },
  required: [
    "id",
    "label",
    "prompt",
    "kind",
    "required",
    "unit",
    "placeholder",
    "options",
    "dependencies",
    "sourcePages",
    "confidence"
  ]
};

export const chunkAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    chunkId: { type: "string" },
    pageRange: { type: "string" },
    productFamilies: {
      type: "array",
      items: { type: "string" }
    },
    orderingPatterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          pattern: { type: "string" },
          evidence: { type: "string" },
          sourcePages: {
            type: "array",
            items: { type: "integer" }
          }
        },
        required: ["label", "pattern", "evidence", "sourcePages"]
      }
    },
    candidateFields: {
      type: "array",
      items: questionnaireFieldSchema
    },
    constraints: {
      type: "array",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    sourceQuality: { type: "string" }
  },
  required: [
    "chunkId",
    "pageRange",
    "productFamilies",
    "orderingPatterns",
    "candidateFields",
    "constraints",
    "warnings",
    "sourceQuality"
  ]
};

export const questionnaireSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    fields: {
      type: "array",
      items: questionnaireFieldSchema
    },
    partNumberModel: {
      type: "object",
      additionalProperties: false,
      properties: {
        familyLabel: { type: "string" },
        pattern: { type: "string" },
        segments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              fieldId: { type: "string" },
              literal: { type: "string" },
              separator: { type: "string" },
              fallback: { type: "string" }
            },
            required: ["label", "fieldId", "literal", "separator", "fallback"]
          }
        },
        notes: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["familyLabel", "pattern", "segments", "notes"]
    },
    constraints: {
      type: "array",
      items: { type: "string" }
    },
    reviewNotes: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["title", "summary", "fields", "partNumberModel", "constraints", "reviewNotes"]
};

export const questionnaireRefinementSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: { type: "string" },
    questionnaire: questionnaireSchema
  },
  required: ["assistantMessage", "questionnaire"]
};

const partSourceRecommendationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mceGroup: { type: "string" },
    businessUnit: { type: "string" },
    lineCard: { type: "string" },
    fitScore: { type: "number" },
    rationale: { type: "string" },
    supportingSignals: {
      type: "array",
      items: { type: "string" }
    },
    caveats: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "mceGroup",
    "businessUnit",
    "lineCard",
    "fitScore",
    "rationale",
    "supportingSignals",
    "caveats"
  ]
};

export const partSourcingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    recommendedSource: partSourceRecommendationSchema,
    alternates: {
      type: "array",
      items: partSourceRecommendationSchema
    },
    nextQuestions: {
      type: "array",
      items: { type: "string" }
    },
    lineCardReferences: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "summary",
    "recommendedSource",
    "alternates",
    "nextQuestions",
    "lineCardReferences"
  ]
};
