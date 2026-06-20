import fs from "node:fs";

const dbPath = process.env.DATABASE_PATH;
if (dbPath) {
  try {
    fs.unlinkSync(dbPath);
  } catch {
    // ignore if file doesn't exist
  }
}
