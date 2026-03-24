import fs from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWorker } from "tesseract.js";
import { matchWinesByText } from "../../src/lib/wineLookup.js";
import { OCR_SCRIPT } from "./paths.mjs";

const execFileAsync = promisify(execFile);

function getAzureEnabled() {
  return Boolean(
    (process.env.AZURE_DOC_INTEL_ENDPOINT || process.env.AZURE_ENDPOINT) &&
    (process.env.AZURE_DOC_INTEL_KEY || process.env.AZURE_KEY),
  );
}

async function tryAzureOcr(filePath) {
  if (!getAzureEnabled()) {
    return null;
  }

  try {
    await access(OCR_SCRIPT, constants.F_OK);
    const { stdout } = await execFileAsync("bash", [OCR_SCRIPT, "--raw", filePath], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = JSON.parse(stdout);
    const lines = parsed.analyzeResult?.pages?.flatMap((page) => (page.lines ?? []).map((line) => line.content)) ?? [];

    return {
      provider: "azure-document-intelligence",
      text: parsed.analyzeResult?.content ?? "",
      lines,
      raw: parsed,
    };
  } catch (error) {
    return {
      provider: "azure-document-intelligence",
      text: "",
      lines: [],
      raw: null,
      error: error.message,
    };
  }
}

async function runTesseractOcr(filePath) {
  const worker = await createWorker("eng");

  try {
    const result = await worker.recognize(filePath);

    return {
      provider: "tesseract.js",
      text: result.data.text ?? "",
      lines: (result.data.lines ?? []).map((line) => line.text),
      raw: {
        confidence: result.data.confidence ?? null,
      },
    };
  } finally {
    await worker.terminate();
  }
}

function extractKeywords(text) {
  return [...new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3),
  )].slice(0, 24);
}

export async function analyzeUploadedImage(filePath, catalog) {
  const azure = await tryAzureOcr(filePath);
  const fallback = !azure || !azure.text.trim();
  const ocr = fallback ? await runTesseractOcr(filePath) : azure;
  const text = ocr.text.trim();
  const candidates = matchWinesByText(text, catalog)
    .filter((match) => match.score >= 18)
    .slice(0, 5)
    .map((match) => ({
      score: match.score,
      confidence: match.confidence,
      coverage: match.coverage,
      matchedTerms: match.matchedTerms,
      wine: match.wine,
    }));

  const metadata = await fs.stat(filePath);

  return {
    ocr,
    fallbackUsed: fallback,
    extractedKeywords: extractKeywords(text),
    candidates,
    file: {
      size: metadata.size,
    },
  };
}
