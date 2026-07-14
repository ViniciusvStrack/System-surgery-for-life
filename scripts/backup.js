import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const runtime = path.join(root, "runtime"); const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); const destination = path.join(root, "backups", timestamp);
fs.mkdirSync(destination, { recursive: true });
for (const file of fs.readdirSync(runtime).filter((name) => name.endsWith(".json"))) fs.copyFileSync(path.join(runtime, file), path.join(destination, file));
console.log(`Backup criado em ${destination}. Proteja e teste a restauração deste diretório.`);
