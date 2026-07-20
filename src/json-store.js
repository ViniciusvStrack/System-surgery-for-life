import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

  readStrict({ allowMissing = true, code = "STORE_CORRUPTED" } = {}) {
    if (!fs.existsSync(this.file)) {
      if (allowMissing) return structuredClone(this.fallback);
      throw Object.assign(new Error("O armazenamento ainda não foi inicializado."), { status: 503, code: "STORE_UNAVAILABLE" });
    }
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (cause) {
      throw Object.assign(new Error("O armazenamento não pôde ser lido com segurança."), { status: 503, code, cause });
    }
  }

  write(value) {
    const directory = path.dirname(this.file);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(directory, 0o700); } catch { /* ACLs podem ser gerenciadas pelo sistema operacional. */ }
    const temp = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    try {
      fs.renameSync(temp, this.file); // Troca atômica reduz risco de arquivo incompleto.
    } catch (error) {
      try { fs.unlinkSync(temp); } catch { /* melhor esforço: o arquivo final permanece intacto */ }
      throw error;
    }
    try { fs.chmodSync(this.file, 0o600); } catch { /* Mantém compatibilidade com ACLs do Windows. */ }
  }
}
