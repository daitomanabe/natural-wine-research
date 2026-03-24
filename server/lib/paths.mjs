import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const SERVER_DIR = path.join(ROOT_DIR, "server");
export const DATA_DIR = path.join(SERVER_DIR, "data");
export const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
export const OCR_SCRIPT = path.join(process.env.HOME ?? "", ".codex", "skills", "azure-ocr", "references", "ocr.sh");
