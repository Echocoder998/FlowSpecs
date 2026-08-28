import { createClient } from "@supabase/supabase-js";
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
}

