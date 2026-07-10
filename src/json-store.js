import fs from "node:fs";
import path from "node:path";

export class JsonStore {
  constructor(file, fallback) {
    this.file = file;
    this.fallback = fallback;
  }

  read() {
    if (!fs.existsSync(this.file)) return structuredClone(this.fallback);
    try { return JSON.parse(fs.readFileSync(this.file, "utf8")); }
    catch { return structuredClone(this.fallback); }
  }

  write(value) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temp, this.file); // Troca atômica reduz risco de arquivo incompleto.
  }
}
