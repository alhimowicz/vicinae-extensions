import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pythonExecutable } from "./platform.ts";

export type PwaInfo = {
  appId: string;
  manifestId: string;
  manifestUrl: string;
  startUrl: string;
  scope: string;
  name: string;
};

export function chromeAppId(manifestId: string): string {
  // Chromium hashes the manifest ID, then its CRX ID utility hashes those bytes again.
  const identityHash = createHash("sha256").update(manifestId).digest();
  return [...createHash("sha256").update(identityHash).digest().subarray(0, 16)]
    .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join("");
}

function website(value: string, base?: string): URL {
  const url = new URL(value, base);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid PWA URL.");
  return url;
}

export function manifestLink(html: string, pageUrl: string, python?: string): string | undefined {
  const parsed = JSON.parse(execFileSync(python || pythonExecutable(), ["-c", `
import json,sys
from html.parser import HTMLParser
class Parser(HTMLParser):
    href=None
    base=None
    def handle_starttag(self, tag, pairs):
        attrs=dict(pairs)
        if tag=='base' and self.base is None: self.base=attrs.get('href')
        if tag=='link' and self.href is None and 'manifest' in (attrs.get('rel') or '').lower().split(): self.href=attrs.get('href')
parser=Parser(convert_charrefs=True)
parser.feed(sys.stdin.read())
print(json.dumps({'href':parser.href,'base':parser.base}))
`], { input: html, encoding: "utf8", timeout: 3000 }));
  if (!parsed.href) return undefined;
  return website(parsed.href, parsed.base ? website(parsed.base, pageUrl).href : pageUrl).href;
}

export function parseManifest(value: unknown, manifestUrl: string, pageUrl: string): PwaInfo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const manifest = value as Record<string, unknown>;
  const name = typeof manifest.name === "string" ? manifest.name.trim()
    : typeof manifest.short_name === "string" ? manifest.short_name.trim() : "";
  const modes = [manifest.display, ...(Array.isArray(manifest.display_override) ? manifest.display_override : [])];
  if (!name || !modes.some((mode) => ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay", "tabbed"].includes(String(mode)))) return undefined;
  if (typeof manifest.start_url !== "string" || !manifest.start_url) return undefined;
  const page = website(pageUrl);
  const start = website(manifest.start_url, manifestUrl);
  if (start.origin !== page.origin) return undefined;
  start.hash = "";
  let identity = typeof manifest.id === "string" ? website(manifest.id, start.origin + "/") : new URL(start);
  if (identity.origin !== start.origin) identity = new URL(start);
  identity.hash = "";
  let scope = new URL(".", start);
  if (typeof manifest.scope === "string") {
    const declared = website(manifest.scope, manifestUrl);
    if (declared.origin === start.origin && start.pathname.startsWith(declared.pathname)) scope = declared;
  }
  scope.hash = "";
  scope.search = "";
  return { appId: chromeAppId(identity.href), manifestId: identity.href, manifestUrl: website(manifestUrl).href, startUrl: start.href, scope: scope.href, name };
}

export function validatePwa(info: PwaInfo, appUrl: string): PwaInfo {
  if (!info || typeof info.name !== "string" || !info.name.trim() || !/^[a-p]{32}$/.test(info.appId)) throw new Error("Invalid PWA metadata.");
  const identity = website(info.manifestId);
  const start = website(info.startUrl);
  const scope = website(info.scope);
  website(info.manifestUrl);
  if (identity.hash || chromeAppId(identity.href) !== info.appId || start.origin !== website(appUrl).origin || identity.origin !== start.origin || scope.origin !== start.origin) {
    throw new Error("Invalid PWA identity or origin.");
  }
  return info;
}

async function download(url: string): Promise<{ text: string; url: string }> {
  const response = await fetch(website(url), { signal: AbortSignal.timeout(10000), credentials: "omit" });
  if (!response.ok || !response.body) throw new Error(`PWA check failed (${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) throw new Error("PWA response is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return { text: Buffer.concat(chunks).toString("utf8"), url: response.url || url };
}

export async function discoverPwa(url: string, python?: string): Promise<PwaInfo | undefined> {
  const page = await download(url);
  // shortcut: detection reads public HTML; authenticated/dynamic manifests need browser integration.
  if (website(page.url).origin !== website(url).origin) return undefined;
  const manifestUrl = manifestLink(page.text, page.url, python);
  if (!manifestUrl) return undefined;
  const manifest = await download(manifestUrl);
  return parseManifest(JSON.parse(manifest.text), manifest.url, page.url);
}
