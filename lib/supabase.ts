// Saved-datasheet types and browser-side helpers.
// (File name kept for import compatibility; storage is now Neon Postgres via /api/datasheets.)
import type { AnswerMap, DatasheetProfile, QuestionnaireModel } from "@/lib/types";

export type SavedDatasheet = {
  id: string;
  title: string;
  file_name: string;
  profile: DatasheetProfile;
  part_number: string;
  confidence_label: string;
  questionnaire: QuestionnaireModel;
  answers: AnswerMap;
  created_at: string;
  updated_at: string;
};

export type DatasheetSaveInput = Omit<
  SavedDatasheet,
  "id" | "created_at" | "updated_at"
>;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with HTTP ${response.status}`);
  }
  return payload as T;
}

export async function listDatasheets() {
  const { datasheets } = await request<{ datasheets: SavedDatasheet[] }>("/api/datasheets");
  return datasheets;
}

export async function saveDatasheet(input: DatasheetSaveInput, id?: string | null) {
  const { datasheet } = await request<{ datasheet: SavedDatasheet }>("/api/datasheets", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(id ? { ...input, id } : input)
  });
  return datasheet;
}

export async function deleteDatasheet(id: string) {
  await request<{ ok: true }>(`/api/datasheets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
