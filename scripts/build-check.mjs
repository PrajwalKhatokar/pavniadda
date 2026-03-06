import fs from "node:fs";
import path from "node:path";

const requiredFiles = [
  "index.html",
  "style.css",
  "script.js",
  path.join("api", "chat.js"),
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const scriptSource = fs.readFileSync("script.js", "utf8");
const apiSource = fs.readFileSync(path.join("api", "chat.js"), "utf8");

// Lightweight production checks.
if (scriptSource.includes("HUGGINGFACE_TOKEN")) {
  throw new Error("Frontend must not contain Hugging Face token references.");
}
if (!scriptSource.includes('const API_URL = "/api/chat";')) {
  throw new Error("Frontend API target must be /api/chat.");
}
if (!apiSource.includes("process.env.HUGGINGFACE_TOKEN")) {
  throw new Error("Serverless route must use HUGGINGFACE_TOKEN env var.");
}

console.log("Build validation passed: production-safe API routing and file checks are valid.");