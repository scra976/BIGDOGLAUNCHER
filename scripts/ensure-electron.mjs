import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(root, "node_modules", "electron");
const exe = path.join(electronDir, "dist", "electron.exe");
const pathTxt = path.join(electronDir, "path.txt");

if (fs.existsSync(exe)) {
  fs.writeFileSync(pathTxt, "electron.exe");
  process.exit(0);
}

const install = path.join(electronDir, "install.js");
if (!fs.existsSync(install)) process.exit(0);

const r = spawnSync(process.execPath, [install], { stdio: "inherit", env: { ...process.env, force_no_cache: "true" } });
if (fs.existsSync(exe)) fs.writeFileSync(pathTxt, "electron.exe");
process.exit(r.status ?? 1);
