import type {
  AnswerMap,
  DatasheetOption,
  PartNumberModel,
  QuestionnaireField
} from "@/lib/types";

function findOption(field: QuestionnaireField, value: unknown): DatasheetOption | undefined {
  if (typeof value !== "string") return undefined;
  return field.options.find(
    (option, index) =>
      option.value === value ||
      option.label === value ||
      `${field.id}-${option.value}-${index}` === value
  );
}

function segmentValue(
  field: QuestionnaireField | undefined,
  answer: AnswerMap[string],
  fallback: string
) {
  if (!field) return fallback || "";

  if (Array.isArray(answer)) {
    const codes = answer
      .map((item) => findOption(field, item)?.code || item)
      .filter(Boolean);
    return codes.length ? codes.join("") : fallback;
  }

  if (typeof answer === "boolean") {
    const boolValue = answer ? "yes" : "no";
    return findOption(field, boolValue)?.code || (answer ? "Y" : "N");
  }

  const option = findOption(field, answer);
  if (option?.code) return option.code;
  if (typeof answer === "number") return Number.isFinite(answer) ? String(answer) : fallback;
  if (typeof answer === "string" && answer.trim()) return answer.trim();
  return fallback;
}

export function renderPartNumber(
  model: PartNumberModel,
  fields: QuestionnaireField[],
  answers: AnswerMap
) {
  if (!model.segments.length) return "";

  return model.segments
    .map((segment) => {
      const piece = segment.literal
        ? segment.literal
        : segmentValue(
            fields.find((field) => field.id === segment.fieldId),
            answers[segment.fieldId],
            segment.fallback || "___"
          );
      return `${piece}${segment.separator || ""}`;
    })
    .join("")
    .replace(/\s+/g, "")
    .replace(/-+$/g, "");
}

export function makeDefaultAnswers(fields: QuestionnaireField[]): AnswerMap {
  return fields.reduce<AnswerMap>((answers, field) => {
    if (field.kind === "multi_select") {
      answers[field.id] = [];
      return answers;
    }

    if (field.kind === "boolean") {
      answers[field.id] = false;
      return answers;
    }

    if (field.kind === "select" && field.options[0]) {
      answers[field.id] = field.options[0].value;
      return answers;
    }

    answers[field.id] = "";
    return answers;
  }, {});
}
