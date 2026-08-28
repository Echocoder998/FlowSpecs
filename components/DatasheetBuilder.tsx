"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  Factory,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { makeDefaultAnswers, renderPartNumber } from "@/lib/part-number";
import { extractPdfText, extractSourceFileText } from "@/lib/file-extraction";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  type DatasheetSaveInput,
  type SavedDatasheet
} from "@/lib/supabase";
import type {
  AnswerMap,
  ChunkAnalysis,
  DatasheetProfile,
  ExtractedPage,
  QuestionnaireField,
  QuestionnaireModel,
  RefinementChatMessage,
  PartSourcingResult,
  TextChunk
} from "@/lib/types";

type Step = "idle" | "extracting" | "ready" | "analyzing" | "complete" | "error";
type AppMode = "builder" | "sourcer";
type SourcingStep = "idle" | "extracting" | "ready" | "sourcing" | "complete" | "error";

type ProgressState = {
  label: string;
  current: number;
  total: number;
};

const CHUNK_CHAR_LIMIT = 36000;
const REFINEMENT_PROGRESS_STEPS = [
  "Preparing refinement",
  "Sending feedback to AI",
  "Rebuilding questionnaire",
  "Applying revised fields"
];

function buildChunks(pages: ExtractedPage[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentText = "";
  let startPage = pages[0]?.pageNumber || 1;
  let endPage = startPage;

  for (const page of pages) {
    const pageText = `\n\n[Page ${page.pageNumber}]\n${page.text}`;
    const wouldOverflow = currentText.length && currentText.length + pageText.length > CHUNK_CHAR_LIMIT;

    if (wouldOverflow) {
      chunks.push({
        id: `chunk_${chunks.length + 1}`,
        startPage,
        endPage,
        text: currentText
      });
      currentText = "";
      startPage = page.pageNumber;
    }

    currentText += pageText;
    endPage = page.pageNumber;
  }

  if (currentText.trim()) {
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      startPage,
      endPage,
      text: currentText
    });
  }

  return chunks;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with HTTP ${response.status}`);
  }

  return payload as T;
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sourceText(field: QuestionnaireField) {
  if (!field.sourcePages.length) return "No page cite";
  return `p. ${field.sourcePages.slice(0, 5).join(", ")}`;
}

function questionnaireConfidence(questionnaire: QuestionnaireModel | null) {
  if (!questionnaire?.fields.length) {
    return { label: "Pending", className: "pending" };
  }

  const average =
    questionnaire.fields.reduce((sum, field) => sum + field.confidence, 0) /
    questionnaire.fields.length;

  if (average >= 0.75) return { label: "High", className: "high" };
  if (average >= 0.45) return { label: "Medium", className: "medium" };
  return { label: "Low", className: "low" };
}

function answerText(field: QuestionnaireField, value: AnswerMap[string]) {
  if (Array.isArray(value)) {
    const labels = value.map((item) => {
      const option = field.options.find(
        (candidate, index) =>
          candidate.value === item ||
          candidate.label === item ||
          `${field.id}-${candidate.value}-${index}` === item
      );
      return option?.label || item;
    });
    return labels.length ? labels.join(", ") : "Not selected";
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "string") {
    const option = field.options.find((candidate) => candidate.value === value);
    return option?.label || value || "Not answered";
  }

  if (typeof value === "number") return String(value);
  return "Not answered";
}

function formatSavedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function DatasheetBuilder() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeMode, setActiveMode] = useState<AppMode>("builder");
  const [step, setStep] = useState<Step>("idle");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [analyses, setAnalyses] = useState<ChunkAnalysis[]>([]);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireModel | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState>({
    label: "",
    current: 0,
    total: 0
  });
  const [profile, setProfile] = useState<DatasheetProfile>({
    manufacturer: "",
    productFamily: "",
    application: ""
  });
  const [savedDatasheets, setSavedDatasheets] = useState<SavedDatasheet[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [storageBusy, setStorageBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<RefinementChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [refinementProgress, setRefinementProgress] = useState<ProgressState>({
    label: "",
    current: 0,
    total: 0
  });

  const extractionStats = useMemo(() => {
    const pageCount = pages.length;
    const charCount = pages.reduce((sum, page) => sum + page.text.length, 0);
    const emptyPages = pages.filter((page) => page.text.length < 20).length;
    return { pageCount, charCount, emptyPages };
  }, [pages]);

  const partNumber = useMemo(() => {
    if (!questionnaire) return "";
    return renderPartNumber(questionnaire.partNumberModel, questionnaire.fields, answers);
  }, [answers, questionnaire]);
  const confidence = useMemo(() => questionnaireConfidence(questionnaire), [questionnaire]);
  const supabaseConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (!supabaseConfigured) return;
    void loadSavedDatasheets();
  }, [supabaseConfigured]);

  useEffect(() => {
    if (!chatBusy) return;

    let stepIndex = 0;
    setRefinementProgress({
      label: REFINEMENT_PROGRESS_STEPS[stepIndex],
      current: stepIndex + 1,
      total: REFINEMENT_PROGRESS_STEPS.length
    });

    const interval = window.setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, REFINEMENT_PROGRESS_STEPS.length - 2);
      setRefinementProgress({
        label: REFINEMENT_PROGRESS_STEPS[stepIndex],
        current: stepIndex + 1,
        total: REFINEMENT_PROGRESS_STEPS.length
      });
    }, 1600);

    return () => window.clearInterval(interval);
  }, [chatBusy]);

  async function loadSavedDatasheets() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStorageMessage("Add Supabase URL and anon key to enable saved datasheets.");
      return;
    }

    setStorageBusy(true);
    const { data, error: loadError } = await supabase
      .from("datasheets")
      .select("*")
      .order("updated_at", { ascending: false });
    setStorageBusy(false);

    if (loadError) {
      setStorageMessage(loadError.message);
      return;
    }

    setSavedDatasheets((data || []) as SavedDatasheet[]);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setQuestionnaire(null);
    setAnalyses([]);
    setChunks([]);
    setAnswers({});
    setChatMessages([]);
    setActiveSavedId(null);
    setFileName(file.name);
    setFileSize(file.size);
    setStep("extracting");
    setProgress({ label: "Reading PDF", current: 0, total: 1 });

    try {
      const extracted = await extractPdfText(file, (label, current, total) => {
        setProgress({ label, current, total });
      });
      setPages(extracted);
      setChunks(buildChunks(extracted));
      setStep("ready");
      setProgress({ label: "Extraction complete", current: 1, total: 1 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read this PDF.");
      setStep("error");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleFile(event.dataTransfer.files[0]);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  async function runAnalysis() {
    const nextChunks = chunks.length ? chunks : buildChunks(pages);
    if (!nextChunks.length) return;

    setStep("analyzing");
    setError("");
    setAnalyses([]);
    setQuestionnaire(null);

    try {
      const nextAnalyses: ChunkAnalysis[] = [];
      for (let index = 0; index < nextChunks.length; index += 1) {
        const chunk = nextChunks[index];
        setProgress({
          label: `Analyzing ${chunk.startPage}-${chunk.endPage}`,
          current: index + 1,
          total: nextChunks.length + 1
        });
        const result = await postJson<{ analysis: ChunkAnalysis }>("/api/analyze-chunk", {
          chunk,
          profile
        });
        nextAnalyses.push(result.analysis);
        setAnalyses([...nextAnalyses]);
      }

      setProgress({
        label: "Synthesizing questionnaire",
        current: nextChunks.length + 1,
        total: nextChunks.length + 1
      });
      const result = await postJson<{ questionnaire: QuestionnaireModel }>("/api/synthesize", {
        analyses: nextAnalyses,
        profile
      });
      setQuestionnaire(result.questionnaire);
      setAnswers(makeDefaultAnswers(result.questionnaire.fields));
      setChatMessages([]);
      setStep("complete");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
      setStep("error");
    }
  }

  async function saveCurrentDatasheet() {
    if (!questionnaire) return;
    const supabase = getSupabaseClient();

    if (!supabase) {
      setStorageMessage("Add Supabase URL and anon key to .env.local, then restart the dev server.");
      return;
    }

    const title = questionnaire.title || fileName.replace(/\.pdf$/i, "") || "Untitled datasheet";
    const payload: DatasheetSaveInput = {
      title,
      file_name: fileName,
      profile,
      part_number: partNumber,
      confidence_label: confidence.label,
      questionnaire,
      answers
    };

    setStorageBusy(true);
    const request = activeSavedId
      ? supabase.from("datasheets").update(payload).eq("id", activeSavedId).select("*").single()
      : supabase.from("datasheets").insert(payload).select("*").single();
    const { data, error: saveError } = await request;
    setStorageBusy(false);

    if (saveError) {
      setStorageMessage(saveError.message);
      return;
    }

    setActiveSavedId(data.id);
    setStorageMessage("Datasheet saved.");
    await loadSavedDatasheets();
  }

  function loadSavedDatasheet(saved: SavedDatasheet) {
    setActiveSavedId(saved.id);
    setFileName(saved.file_name);
    setFileSize(0);
    setPages([]);
    setChunks([]);
    setAnalyses([]);
    setProfile(saved.profile);
    setQuestionnaire(saved.questionnaire);
    setAnswers(saved.answers);
    setChatMessages([]);
    setRefinementProgress({ label: "", current: 0, total: 0 });
    setError("");
    setProgress({ label: "", current: 0, total: 0 });
    setStep("complete");
    setStorageMessage(`Loaded ${saved.title}.`);
  }

  async function deleteSavedDatasheet(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setStorageBusy(true);
    const { error: deleteError } = await supabase.from("datasheets").delete().eq("id", id);
    setStorageBusy(false);

    if (deleteError) {
      setStorageMessage(deleteError.message);
      return;
    }

    if (activeSavedId === id) setActiveSavedId(null);
    setStorageMessage("Datasheet deleted.");
    await loadSavedDatasheets();
  }

  async function sendRefinementMessage() {
    const message = chatInput.trim();
    if (!message || !questionnaire || chatBusy) return;

    const nextMessages: RefinementChatMessage[] = [
      ...chatMessages,
      { role: "user", content: message }
    ];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    setRefinementProgress({
      label: "Preparing refinement",
      current: 1,
      total: REFINEMENT_PROGRESS_STEPS.length
    });
    setError("");

    try {
      const result = await postJson<{
        assistantMessage: string;
        questionnaire: QuestionnaireModel;
      }>("/api/refine-questionnaire", {
        message,
        messages: nextMessages,
        questionnaire,
        answers,
        analyses,
        profile,
        partNumber,
        fileName
      });

      setRefinementProgress({
        label: "Applying revised fields",
        current: REFINEMENT_PROGRESS_STEPS.length,
        total: REFINEMENT_PROGRESS_STEPS.length
      });
      setQuestionnaire(result.questionnaire);
      setAnswers((current) => ({
        ...makeDefaultAnswers(result.questionnaire.fields),
        ...current
      }));
      setActiveSavedId(null);
      setChatMessages([
        ...nextMessages,
        { role: "assistant", content: result.assistantMessage }
      ]);
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "Refinement failed.";
      setRefinementProgress({
        label: "Refinement failed",
        current: REFINEMENT_PROGRESS_STEPS.length,
        total: REFINEMENT_PROGRESS_STEPS.length
      });
      setChatMessages([
        ...nextMessages,
        { role: "assistant", content: messageText }
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function downloadPdf() {
    if (!questionnaire) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 44;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    function addLine(text: string, size = 10, style: "normal" | "bold" = "normal") {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth);

      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += size + 6;
      }
    }

    addLine(questionnaire.title || "Datasheet Questionnaire", 18, "bold");
    addLine(`Part number: ${partNumber || "Pending"}`, 12, "bold");
    addLine(`AI confidence: ${confidence.label}`, 10);
    addLine(`Source file: ${fileName || "Saved datasheet"}`, 10);
    addLine(`Generated: ${new Date().toLocaleString()}`, 10);
    y += 10;

    if (questionnaire.summary) {
      addLine("Summary", 13, "bold");
      addLine(questionnaire.summary, 10);
      y += 8;
    }

    addLine("Customer Configuration", 13, "bold");
    questionnaire.fields.forEach((field, index) => {
      const answer = answerText(field, answers[field.id]);
      addLine(`${index + 1}. ${field.label}`, 11, "bold");
      addLine(`Answer: ${answer}${field.unit ? ` ${field.unit}` : ""}`, 10);
      addLine(`Prompt: ${field.prompt}`, 9);
      if (field.sourcePages.length) addLine(`Source pages: ${field.sourcePages.join(", ")}`, 9);
      y += 6;
    });

    if (questionnaire.constraints.length || questionnaire.reviewNotes.length) {
      addLine("Review Notes", 13, "bold");
      [...questionnaire.constraints, ...questionnaire.reviewNotes].forEach((note) => {
        addLine(`- ${note}`, 9);
      });
    }

    doc.save(`${(questionnaire.title || fileName || "datasheet").replace(/[^\w.-]+/g, "-")}.pdf`);
  }

  function setAnswer(fieldId: string, value: AnswerMap[string]) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  function toggleMulti(fieldId: string, optionValue: string) {
    const current = answers[fieldId];
    const values = Array.isArray(current) ? current : [];
    setAnswer(
      fieldId,
      values.includes(optionValue)
        ? values.filter((value) => value !== optionValue)
        : [...values, optionValue]
    );
  }

  async function copyPartNumber() {
    if (!partNumber) return;
    await navigator.clipboard.writeText(partNumber);
  }

  function downloadQuestionnaire() {
    if (!questionnaire) return;
    const payload = {
      fileName,
      profile,
      partNumber,
      answers,
      questionnaire,
      generatedAt: new Date().toISOString()
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.pdf$/i, "") || "datasheet"}-questionnaire.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const busy = step === "extracting" || step === "analyzing";
  const progressPercent = progress.total
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  const refinementProgressPercent = refinementProgress.total
    ? Math.round((refinementProgress.current / refinementProgress.total) * 100)
    : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brandmark" aria-hidden="true">
          <Factory size={25} />
        </div>
        <div>
          <p className="eyebrow">Industrial configuration</p>
          <h1>Datasheet Questionnaire Builder</h1>
        </div>
        <div className="top-actions">
          <div className="mode-tabs" role="tablist" aria-label="Workflow">
            <button
              type="button"
              className={activeMode === "builder" ? "active" : ""}
              onClick={() => setActiveMode("builder")}
              role="tab"
              aria-selected={activeMode === "builder"}
            >
              <Wand2 size={16} />
              Builder
            </button>
            <button
              type="button"
              className={activeMode === "sourcer" ? "active" : ""}
              onClick={() => setActiveMode("sourcer")}
              role="tab"
              aria-selected={activeMode === "sourcer"}
            >
              <Search size={16} />
              Sourcer
            </button>
          </div>
        </div>
      </header>

      {activeMode === "sourcer" ? <PartSourcer /> : (
      <section className="workspace">
        <aside className="control-panel panel">
          <div
            className={`dropzone ${fileName ? "has-file" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
            />
            <FileText size={32} />
            <div>
              <strong>{fileName || "Datasheet PDF"}</strong>
              <span>{fileName ? formatFileSize(fileSize) : "Drop or browse"}</span>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              title="Choose PDF"
            >
              <Upload size={18} />
            </button>
          </div>

          <div className="profile-grid">
            <label>
              <span>Manufacturer</span>
              <input
                value={profile.manufacturer}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, manufacturer: event.target.value }))
                }
                placeholder="Optional"
              />
            </label>
            <label>
              <span>Product family</span>
              <input
                value={profile.productFamily}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, productFamily: event.target.value }))
                }
                placeholder="Optional"
              />
            </label>
            <label>
              <span>Application</span>
              <input
                value={profile.application}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, application: event.target.value }))
                }
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="stats-grid" aria-label="Extraction stats">
            <div>
              <span>Pages</span>
              <strong>{extractionStats.pageCount}</strong>
            </div>
            <div>
              <span>Chunks</span>
              <strong>{chunks.length}</strong>
            </div>
            <div>
              <span>Text</span>
              <strong>{extractionStats.charCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Blank</span>
              <strong>{extractionStats.emptyPages}</strong>
            </div>
          </div>

          {progress.label ? (
            <div className="progress-box">
              <div>
                <span>{progress.label}</span>
                <strong>{progressPercent}%</strong>
              </div>
              <div className="progress-track">
                <div style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          {extractionStats.emptyPages > 0 && step !== "idle" ? (
            <div className="notice">
              <AlertTriangle size={18} />
              <span>{extractionStats.emptyPages} page(s) had little extractable text.</span>
            </div>
          ) : null}

          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={runAnalysis}
              disabled={busy || !pages.length}
            >
              {step === "analyzing" ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              Build questionnaire
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                setStep("idle");
                setFileName("");
                setFileSize(0);
                setPages([]);
                setChunks([]);
                setAnalyses([]);
                setQuestionnaire(null);
                setAnswers({});
                setChatMessages([]);
                setRefinementProgress({ label: "", current: 0, total: 0 });
                setActiveSavedId(null);
                setError("");
                setProgress({ label: "", current: 0, total: 0 });
              }}
              disabled={busy}
              title="Reset"
            >
              <RefreshCcw size={18} />
            </button>
          </div>
        </aside>

        <section className="result-panel panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Generated output</p>
              <h2>{questionnaire?.title || "Questionnaire"}</h2>
            </div>
            <div className="panel-actions">
              <button
                className="icon-button"
                type="button"
                onClick={copyPartNumber}
                disabled={!partNumber}
                title="Copy part number"
              >
                <Clipboard size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={downloadQuestionnaire}
                disabled={!questionnaire}
                title="Download JSON"
              >
                <Download size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={downloadPdf}
                disabled={!questionnaire}
                title="Download PDF"
              >
                <FileDown size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={saveCurrentDatasheet}
                disabled={!questionnaire || storageBusy}
                title="Save datasheet"
              >
                {storageBusy ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              </button>
            </div>
          </div>

          <div className="part-preview">
            <div className="part-preview-head">
              <span>Part number</span>
              <span className={`confidence-pill ${confidence.className}`}>
                AI confidence: {confidence.label}
              </span>
            </div>
            <strong>{partNumber || "Pending"}</strong>
            {questionnaire ? <small>{questionnaire.partNumberModel.pattern || "Pattern pending"}</small> : null}
          </div>

          {step === "idle" ? (
            <div className="empty-state">
              <Upload size={36} />
              <strong>Upload a datasheet</strong>
            </div>
          ) : null}

          {busy ? (
            <div className="empty-state">
              <Loader2 className="spin" size={36} />
              <strong>{progress.label || "Working"}</strong>
            </div>
          ) : null}

          {!busy && analyses.length > 0 && !questionnaire ? (
            <div className="analysis-list">
              {analyses.map((analysis) => (
                <div key={analysis.chunkId} className="analysis-row">
                  <CheckCircle2 size={18} />
                  <span>{analysis.pageRange}</span>
                  <strong>{analysis.candidateFields.length} fields</strong>
                </div>
              ))}
            </div>
          ) : null}

          {questionnaire ? (
            <div className="questionnaire-grid">
              <div className="field-list">
                {questionnaire.fields.map((field, index) => (
                  <div className="field-card" key={field.id}>
                    <div className="field-head">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{field.label}</strong>
                        <small>{sourceText(field)}</small>
                      </div>
                    </div>
                    <p>{field.prompt}</p>
                    <FieldControl field={field} answers={answers} setAnswer={setAnswer} toggleMulti={toggleMulti} />
                    {field.dependencies.length ? (
                      <div className="field-notes">
                        {field.dependencies.slice(0, 3).map((dependency) => (
                          <span key={dependency}>{dependency}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <aside className="review-panel">
                <h3>Review</h3>
                {questionnaire.constraints.map((constraint) => (
                  <div className="review-row warning" key={constraint}>
                    <AlertTriangle size={16} />
                    <span>{constraint}</span>
                  </div>
                ))}
                {questionnaire.reviewNotes.map((note) => (
                  <div className="review-row success" key={note}>
                    <CheckCircle2 size={16} />
                    <span>{note}</span>
                  </div>
                ))}
              </aside>
            </div>
          ) : null}
        </section>

        <aside className="saved-panel panel">
          <div className="chat-box">
            <div className="saved-head">
              <div>
                <p className="eyebrow">AI refinement</p>
                <h3>Improve accuracy</h3>
              </div>
              <MessageSquare size={20} />
            </div>

            <div className="chat-log">
              {chatMessages.length ? (
                chatMessages.map((message, index) => (
                  <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                    <span>{message.role === "user" ? "You" : "AI"}</span>
                    <p>{message.content}</p>
                  </div>
                ))
              ) : (
                <div className="chat-empty">
                  Ask for corrections to fields, option codes, missing choices, or part-number logic.
                </div>
              )}
            </div>

            {refinementProgress.label ? (
              <div className="progress-box chat-progress" aria-live="polite">
                <div>
                  <span>{refinementProgress.label}</span>
                  <strong>{refinementProgressPercent}%</strong>
                </div>
                <div className="progress-track">
                  <div style={{ width: `${refinementProgressPercent}%` }} />
                </div>
              </div>
            ) : null}

            <div className="chat-form">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Example: The output signal should include 4-20 mA HART and Profibus PA."
                disabled={!questionnaire || chatBusy}
                rows={4}
              />
              <button
                className="primary-button"
                type="button"
                onClick={sendRefinementMessage}
                disabled={!questionnaire || !chatInput.trim() || chatBusy}
              >
                {chatBusy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                Refine
              </button>
            </div>
          </div>

          <div className="saved-head">
            <div>
              <p className="eyebrow">Supabase</p>
              <h3>Saved datasheets</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={loadSavedDatasheets}
              disabled={!supabaseConfigured || storageBusy}
              title="Refresh saved datasheets"
            >
              {storageBusy ? <Loader2 className="spin" size={18} /> : <Database size={18} />}
            </button>
          </div>

          {!supabaseConfigured ? (
            <div className="notice">
              <AlertTriangle size={18} />
              <span>Add Supabase keys to enable cloud saves.</span>
            </div>
          ) : null}

          {storageMessage ? <div className="storage-message">{storageMessage}</div> : null}

          <div className="saved-list">
            {savedDatasheets.map((saved) => (
              <div className={`saved-row ${activeSavedId === saved.id ? "active" : ""}`} key={saved.id}>
                <button type="button" onClick={() => loadSavedDatasheet(saved)}>
                  <strong>{saved.title}</strong>
                  <span>{saved.part_number || "No part number"} / {formatSavedDate(saved.updated_at)}</span>
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => deleteSavedDatasheet(saved.id)}
                  disabled={storageBusy}
                  title="Delete datasheet"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      </section>
      )}
    </main>
  );
}

function scoreLabel(score: number) {
  if (score >= 0.78) return { label: "Strong fit", className: "high" };
  if (score >= 0.5) return { label: "Likely fit", className: "medium" };
  return { label: "Needs review", className: "low" };
}

function PartSourcer() {
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<SourcingStep>("idle");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [fileText, setFileText] = useState("");
  const [result, setResult] = useState<PartSourcingResult | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState>({
    label: "",
    current: 0,
    total: 0
  });

  const busy = step === "extracting" || step === "sourcing";
  const progressPercent = progress.total
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  const canSource = Boolean(partNumber.trim() || description.trim() || fileText.trim());

  async function handleSourceFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setResult(null);
    setFileName(file.name);
    setFileSize(file.size);
    setFileText("");
    setStep("extracting");
    setProgress({ label: "Reading source file", current: 0, total: 1 });

    try {
      const text = await extractSourceFileText(file, (label, current, total) => {
        setProgress({ label, current, total });
      });
      setFileText(text);
      setStep("ready");
      setProgress({ label: "Source file ready", current: 1, total: 1 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read this file.");
      setStep("error");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleSourceFile(event.dataTransfer.files[0]);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleSourceFile(event.target.files?.[0]);
    event.target.value = "";
  }

  async function runSourcing() {
    if (!canSource || busy) return;
    setStep("sourcing");
    setError("");
    setResult(null);
    setProgress({ label: "Matching MCE capabilities", current: 1, total: 2 });

    try {
      const payload = await postJson<{ result: PartSourcingResult }>("/api/source-part", {
        partNumber,
        description,
        fileName,
        fileText
      });
      setResult(payload.result);
      setStep("complete");
      setProgress({ label: "Recommendation ready", current: 2, total: 2 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sourcing failed.");
      setStep("error");
      setProgress({ label: "Sourcing failed", current: 2, total: 2 });
    }
  }

  function resetSourcer() {
    setStep("idle");
    setPartNumber("");
    setDescription("");
    setFileName("");
    setFileSize(0);
    setFileText("");
    setResult(null);
    setError("");
    setProgress({ label: "", current: 0, total: 0 });
  }

  const sourceScore = result ? scoreLabel(result.recommendedSource.fitScore) : null;

  return (
    <section className="sourcer-workspace">
      <aside className="control-panel panel">
        <div className="profile-grid">
          <label>
            <span>Part number</span>
            <input
              value={partNumber}
              onChange={(event) => setPartNumber(event.target.value)}
              placeholder="Example: 4F-H6L-10-SS"
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Valve, cylinder, sensor, pump, compressor, fitting, filter, motor..."
              rows={5}
            />
          </label>
        </div>

        <div
          className={`dropzone ${fileName ? "has-file" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={sourceFileInputRef}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf,.xlsx,.csv,.txt,text/plain,text/csv"
            onChange={handleFileChange}
          />
          {fileName.toLowerCase().endsWith(".xlsx") ? <FileSpreadsheet size={32} /> : <FileText size={32} />}
          <div>
            <strong>{fileName || "PDF or spreadsheet"}</strong>
            <span>{fileName ? formatFileSize(fileSize) : "Drop or browse"}</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => sourceFileInputRef.current?.click()}
            disabled={busy}
            title="Choose source file"
          >
            <Upload size={18} />
          </button>
        </div>

        <div className="stats-grid" aria-label="Sourcing context stats">
          <div>
            <span>Part</span>
            <strong>{partNumber.trim() ? "Yes" : "No"}</strong>
          </div>
          <div>
            <span>File</span>
            <strong>{fileName ? "Yes" : "No"}</strong>
          </div>
          <div>
            <span>Text</span>
            <strong>{fileText.length.toLocaleString()}</strong>
          </div>
          <div>
            <span>Refs</span>
            <strong>{result?.lineCardReferences.length || 0}</strong>
          </div>
        </div>

        {progress.label ? (
          <div className="progress-box">
            <div>
              <span>{progress.label}</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="progress-track">
              <div style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={runSourcing}
            disabled={!canSource || busy}
          >
            {step === "sourcing" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            Recommend source
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={resetSourcer}
            disabled={busy}
            title="Reset"
          >
            <RefreshCcw size={18} />
          </button>
        </div>
      </aside>

      <section className="result-panel panel sourcer-results">
        <div className="panel-head">
          <div>
            <p className="eyebrow">MCE sourcing</p>
            <h2>Part Sourcer</h2>
          </div>
          {sourceScore ? (
            <span className={`confidence-pill ${sourceScore.className}`}>
              {sourceScore.label}: {Math.round(result!.recommendedSource.fitScore * 100)}%
            </span>
          ) : null}
        </div>

        {!result && !busy ? (
          <div className="empty-state">
            <Search size={36} />
            <strong>Enter item details to route the part</strong>
          </div>
        ) : null}

        {busy ? (
          <div className="empty-state">
            <Loader2 className="spin" size={36} />
            <strong>{progress.label || "Working"}</strong>
          </div>
        ) : null}

        {result ? (
          <div className="sourcing-output">
            <div className="source-card primary-source">
              <div>
                <p className="eyebrow">Recommended source</p>
                <h3>{result.recommendedSource.lineCard}</h3>
              </div>
              <div className="source-meta">
                <span>{result.recommendedSource.mceGroup}</span>
                <span>{result.recommendedSource.businessUnit}</span>
              </div>
              <p>{result.summary}</p>
              <p>{result.recommendedSource.rationale}</p>
              {result.recommendedSource.branchName || result.recommendedSource.contactName ? (
                <div className="review-row success">
                  <CheckCircle2 size={16} />
                  <span>
                    {result.recommendedSource.branchName ? `Branch: ${result.recommendedSource.branchName}` : ""}
                    {result.recommendedSource.branchName && result.recommendedSource.contactName ? " — " : ""}
                    {result.recommendedSource.contactName ? `Contact: ${result.recommendedSource.contactName}` : ""}
                    {result.recommendedSource.contactEmail ? ` (${result.recommendedSource.contactEmail})` : ""}
                    {result.recommendedSource.contactPhone ? ` ${result.recommendedSource.contactPhone}` : ""}
                  </span>
                </div>
              ) : null}
              <SignalList title="Signals" items={result.recommendedSource.supportingSignals} />
              <SignalList title="Caveats" items={result.recommendedSource.caveats} />
            </div>

            {result.alternates.length ? (
              <div className="alternate-grid">
                {result.alternates.map((alternate) => (
                  <div className="source-card" key={`${alternate.mceGroup}-${alternate.lineCard}`}>
                    <div className="source-card-head">
                      <strong>{alternate.lineCard}</strong>
                      <span className={scoreLabel(alternate.fitScore).className}>
                        {Math.round(alternate.fitScore * 100)}%
                      </span>
                    </div>
                    <small>{alternate.mceGroup} / {alternate.businessUnit}</small>
                    <p>{alternate.rationale}</p>
                    {alternate.branchName || alternate.contactName ? (
                      <small>
                        {alternate.branchName ? `Branch: ${alternate.branchName}` : ""}
                        {alternate.branchName && alternate.contactName ? " — " : ""}
                        {alternate.contactName ? `Contact: ${alternate.contactName}` : ""}
                      </small>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="review-panel sourcer-review">
              <h3>Follow up</h3>
              {result.nextQuestions.map((question) => (
                <div className="review-row warning" key={question}>
                  <MessageSquare size={16} />
                  <span>{question}</span>
                </div>
              ))}
              {result.lineCardReferences.map((reference) => (
                <div className="review-row success" key={reference}>
                  <CheckCircle2 size={16} />
                  <span>{reference}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function SignalList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <div className="signal-list">
      <strong>{title}</strong>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function FieldControl({
  field,
  answers,
  setAnswer,
  toggleMulti
}: {
  field: QuestionnaireField;
  answers: AnswerMap;
  setAnswer: (fieldId: string, value: AnswerMap[string]) => void;
  toggleMulti: (fieldId: string, optionValue: string) => void;
}) {
  const value = answers[field.id];

  if (field.kind === "select") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(event) => setAnswer(field.id, event.target.value)}
      >
        {field.options.map((option, index) => (
          <option key={`${field.id}-${option.value}-${index}`} value={option.value}>
            {option.label}
            {option.code ? ` (${option.code})` : ""}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "multi_select") {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="checkbox-grid">
        {field.options.map((option, index) => {
          const optionKey = `${field.id}-${option.value}-${index}`;
          return (
          <label key={optionKey}>
            <input
              type="checkbox"
              checked={values.includes(optionKey)}
              onChange={() => toggleMulti(field.id, optionKey)}
            />
            <span>{option.label}</span>
            {option.code ? <small>{option.code}</small> : null}
          </label>
          );
        })}
      </div>
    );
  }

  if (field.kind === "boolean") {
    return (
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => setAnswer(field.id, event.target.checked)}
        />
        <span>{Boolean(value) ? "Yes" : "No"}</span>
      </label>
    );
  }

  if (field.kind === "number") {
    return (
      <div className="unit-input">
        <input
          type="number"
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => setAnswer(field.id, event.target.value)}
        />
        {field.unit ? <span>{field.unit}</span> : null}
      </div>
    );
  }

  return (
    <input
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      onChange={(event) => setAnswer(field.id, event.target.value)}
    />
  );
}
