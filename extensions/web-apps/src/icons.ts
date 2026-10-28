import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import catalogue from "../assets/dashboard-icons.json" with { type: "json" };
import { appIdPattern, dataHome, pythonExecutable } from "./platform.ts";

const run = promisify(execFile);
const maximumBytes = 4 * 1024 * 1024;
const compact = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z\d]/g, "");

export function inferIcon(name: string, website = ""): string | undefined {
  const title = compact(name.replace(/\s*\([^)]*\)\s*$/, ""));
  let host = "";
  try { host = compact(new URL(website).hostname.replace(/^(?:www|app|web)\./, "").split(".")[0]); } catch { /* The URL may still be being typed. */ }
  let winner: { slug: string; score: number } | undefined;
  for (const [slug, aliases] of Object.entries(catalogue)) {
    if (!/^[a-z\d_-]+$/i.test(slug)) continue;
    for (const label of [slug, ...aliases]) {
      const candidate = compact(label);
      if (!candidate) continue;
      const score = title === candidate ? 10000 + candidate.length
        : host && host === candidate ? 5000 + candidate.length
        : candidate.length >= 4 && title.includes(candidate) ? candidate.length : 0;
      if (score && (!winner || score > winner.score)) winner = { slug, score };
    }
  }
  return winner?.slug;
}

async function downloadIcon(source: string): Promise<Buffer> {
  const url = new URL(source);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS icon URL.");
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok || !response.body) throw new Error(`Icon download failed (${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumBytes) throw new Error("Icon must be smaller than 4 MB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export async function resolveIcon(name: string, website: string, source: string, python?: string): Promise<{ data?: Buffer; warning?: string }> {
  source = source.trim();
  const slug = inferIcon(name, website);
  const location = source || (slug ? `https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/png/${slug}.png` : "");
  if (!location) return { warning: "No matching icon found; using the default icon. You can set one with Edit Web App." };
  const temporary = mkdtempSync(join(tmpdir(), "vicinae-icon-"));
  try {
    let data: Buffer;
    if (/^https?:\/\//i.test(location)) data = await downloadIcon(location);
    else {
      const path = location.startsWith("~/") ? join(homedir(), location.slice(2)) : location;
      if (!path.startsWith("/")) throw new Error("Enter an absolute icon file path or an HTTP/HTTPS URL.");
      const file = statSync(path);
      if (!file.isFile() || file.size > maximumBytes) throw new Error("Icon must be an image file smaller than 4 MB.");
      data = readFileSync(path);
      if (data.length > maximumBytes) throw new Error("Icon must be smaller than 4 MB.");
    }
    const input = join(temporary, "input");
    const output = join(temporary, "icon.png");
    writeFileSync(input, data);
    await run(python || pythonExecutable(), ["-c", `
import gi,sys
gi.require_version('GdkPixbuf','2.0')
from gi.repository import GdkPixbuf
image=GdkPixbuf.Pixbuf.new_from_file_at_scale(sys.argv[1],208,208,True).add_alpha(False,0,0,0)
canvas=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,True,8,256,256)
canvas.fill(0)
image.copy_area(0,0,image.get_width(),image.get_height(),canvas,(256-image.get_width())//2,(256-image.get_height())//2)
canvas.savev(sys.argv[2],'png',[],[])
`, input, output], { timeout: 10000 });
    return { data: readFileSync(output) };
  } catch (error) {
    if (source) throw new Error(`Could not use that icon: ${String(error)}`);
    return { warning: "Icon lookup failed; using the default icon. You can set one with Edit Web App." };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function installIcon(id: string, data: Buffer): string {
  if (!appIdPattern.test(id)) throw new Error("Invalid web app launcher.");
  const directory = join(dataHome(), "icons/hicolor/256x256/apps");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${id}-${createHash("sha256").update(data).digest("hex").slice(0, 12)}.png`);
  if (!existsSync(path)) writeFileSync(path, data, { flag: "wx", mode: 0o644 });
  return path;
}
