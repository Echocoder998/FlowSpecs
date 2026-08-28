import type { ExtractedPage } from "@/lib/types";

const OCR_TEXT_THRESHOLD = 20;
const OCR_RENDER_SCALE = 2.4;
const OCR_MAX_CANVAS_SIDE = 2400;

export type ExtractionProgress = (label: string, current: number, total: number) => void;

function normalizeExtractedText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

async function renderPageCanvas(page: any) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    OCR_RENDER_SCALE,
    OCR_MAX_CANVAS_SIDE / Math.max(baseViewport.width, baseViewport.height)
  );
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Could not create an OCR canvas for this PDF page.");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function ocrPdfPage(page: any, worker: any) {
  const canvas = await renderPageCanvas(page);

  try {
    const result = await worker.recognize(canvas);
    return normalizeExtractedText(result.data.text || "");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function extractPdfText(
  file: File,
  onProgress: ExtractionProgress
): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: ExtractedPage[] = [];
  let ocrWorker: any = null;

  async function getOcrWorker(pageNumber: number) {
    if (ocrWorker) return ocrWorker;

    onProgress("Loading OCR engine", pageNumber - 1, pdf.numPages);
    const Tesseract = await import("tesseract.js");
    ocrWorker = await Tesseract.createWorker("eng", undefined, {
      logger: (message) => {
        if (message.status === "recognizing text") {
          onProgress(
            `OCR page ${pageNumber}/${pdf.numPages}`,
            pageNumber - 1 + message.progress,
            pdf.numPages
          );
        }
      }
    });
    await ocrWorker.setParameters({
      preserve_interword_spaces: "1"
    });
    return ocrWorker;
  }

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Extracting page ${pageNumber}/${pdf.numPages}`, pageNumber - 1, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = normalizeExtractedText(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
      );

      if (text.length < OCR_TEXT_THRESHOLD) {
        const worker = await getOcrWorker(pageNumber);
        onProgress(`OCR page ${pageNumber}/${pdf.numPages}`, pageNumber - 1, pdf.numPages);
        text = await ocrPdfPage(page, worker);
      }

      pages.push({ pageNumber, text });
      onProgress(`Finished page ${pageNumber}/${pdf.numPages}`, pageNumber, pdf.numPages);
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }

  return pages;
}

function decodeXmlEntities(input: string) {
  if (!input) return "";
  const parser = new DOMParser();
  return parser.parseFromString(`<x>${input}</x>`, "text/xml").documentElement.textContent || "";
}

function cellColumn(reference: string) {
  const letters = reference.replace(/\d+/g, "");
  let column = 0;
  for (const letter of letters) {
    column = column * 26 + letter.toUpperCase().charCodeAt(0) - 64;
  }
  return Math.max(column - 1, 0);
}

export async function extractXlsxText(file: File) {
  const { strFromU8, unzipSync } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const parser = new DOMParser();
  const sharedStringsXml = archive["xl/sharedStrings.xml"]
    ? strFromU8(archive["xl/sharedStrings.xml"])
    : "";
  const sharedStrings = sharedStringsXml
    ? Array.from(parser.parseFromString(sharedStringsXml, "text/xml").getElementsByTagName("si")).map((item) =>
        Array.from(item.getElementsByTagName("t"))
          .map((node) => node.textContent || "")
          .join("")
      )
    : [];

  const sheetNames = Object.keys(archive)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const sheetTexts: string[] = [];

  for (const sheetName of sheetNames.slice(0, 8)) {
    const sheet = parser.parseFromString(strFromU8(archive[sheetName]), "text/xml");
    const rows = Array.from(sheet.getElementsByTagName("row"));
    const rowTexts = rows.slice(0, 250).map((row) => {
      const values: string[] = [];
      for (const cell of Array.from(row.getElementsByTagName("c"))) {
        const reference = cell.getAttribute("r") || "";
        const type = cell.getAttribute("t") || "";
        const valueNode = cell.getElementsByTagName("v")[0];
        const inlineText = cell.getElementsByTagName("t")[0]?.textContent || "";
        const rawValue = valueNode?.textContent || inlineText;
        const value = type === "s" ? sharedStrings[Number(rawValue)] || "" : decodeXmlEntities(rawValue);
        values[cellColumn(reference)] = value.trim();
      }
      return values.map((value) => value || "").join("\t").trim();
    });

    const text = rowTexts.filter(Boolean).join("\n");
    if (text) {
      sheetTexts.push(`[${sheetName.replace(/^xl\/worksheets\//, "").replace(/\.xml$/i, "")}]\n${text}`);
    }
  }

  return sheetTexts.join("\n\n").trim();
}

export async function extractSourceFileText(file: File, onProgress: ExtractionProgress) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const extracted = await extractPdfText(file, onProgress);
    return extracted.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join("\n\n");
  }

  if (name.endsWith(".xlsx")) {
    onProgress("Reading spreadsheet", 0, 1);
    const text = await extractXlsxText(file);
    onProgress("Spreadsheet ready", 1, 1);
    return text;
  }

  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type.startsWith("text/")) {
    onProgress("Reading file", 0, 1);
    const text = await file.text();
    onProgress("File ready", 1, 1);
    return text;
  }

  throw new Error("Upload a PDF, XLSX, CSV, or text file.");
}
