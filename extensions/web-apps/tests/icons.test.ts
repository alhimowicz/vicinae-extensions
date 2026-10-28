import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inferIcon, resolveIcon } from "../src/icons.ts";
import { runtime } from "./fixtures.ts";

test("icon lookup handles spaces, aliases, descriptive names and website fallback", () => {
  assert.equal(inferIcon("Chat GPT"), "chatgpt");
  assert.equal(inferIcon("ChatGPT Work"), "chatgpt");
  assert.equal(inferIcon("Google Calendar"), "google-calendar");
  assert.equal(inferIcon("webmail-service"), "gmail");
  assert.equal(inferIcon("Private Workspace", "https://chatgpt.com/"), "chatgpt");
  assert.equal(inferIcon("qzxv938274"), undefined);
});

test("Slack workspace labels and app subdomains do not select unrelated icons", () => {
  assert.equal(inferIcon("Slack (Rails Team)", "https://app.slack.com/client/"), "slack");
  assert.equal(inferIcon("Slack (Rails Team)"), "slack");
  assert.equal(inferIcon("Slack Work", "https://app.slack.com/client/"), "slack");
  assert.equal(inferIcon("Private Workspace", "https://app.chatgpt.com/"), "chatgpt");
});

test("custom local and URL icons are decoded to PNG; invalid or oversized images are rejected", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-icon-test-"));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="blue"/></svg>';
  const server = createServer((request, response) => {
    response.end(request.url === "/large" ? Buffer.alloc(4 * 1024 * 1024 + 1) : svg);
  });
  try {
    const local = join(directory, "my icon.svg");
    writeFileSync(local, svg);
    const result = await resolveIcon("App", "https://example.com", local);
    assert.equal(result.data?.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    writeFileSync(local, "not an image");
    await assert.rejects(resolveIcon("App", "https://example.com", local), /Could not use that icon/);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await resolveIcon("App", "https://example.com", base + "/icon")).data?.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    await assert.rejects(resolveIcon("App", "https://example.com", base + "/large"), /smaller than 4 MB/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("automatic icon lookup falls back when the bank cannot be reached", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    const result = await resolveIcon("ChatGPT", "https://chatgpt.com/", "");
    assert.equal(result.data, undefined);
    assert.ok(result.warning?.includes("lookup failed"));
  } finally {
    globalThis.fetch = original;
  }
});

test("dock icons have a transparent margin and preserve wide artwork proportions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-icon-padding-"));
  try {
    for (const [width, height, expectedBounds] of [
      [64, 64, [24, 24, 232, 232]],
      [128, 64, [24, 76, 232, 180]],
    ] as const) {
      const source = join(directory, "source.svg");
      const output = join(directory, "output.png");
      writeFileSync(source, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="blue"/></svg>`);
      const result = await resolveIcon("App", "https://example.com", source);
      assert.ok(result.data);
      writeFileSync(output, result.data);
      const image = JSON.parse(execFileSync(runtime.python!, ["-c", `
import gi,json,sys
gi.require_version('GdkPixbuf','2.0')
from gi.repository import GdkPixbuf
image=GdkPixbuf.Pixbuf.new_from_file(sys.argv[1])
pixels=image.get_pixels()
stride=image.get_rowstride()
channels=image.get_n_channels()
visible=[(x,y) for y in range(image.get_height()) for x in range(image.get_width()) if pixels[y*stride+x*channels+3]>0]
bounds=[min(p[0] for p in visible),min(p[1] for p in visible),max(p[0] for p in visible)+1,max(p[1] for p in visible)+1]
print(json.dumps({'size':[image.get_width(),image.get_height()],'bounds':bounds}))
`, output], { encoding: "utf8" }));
      assert.deepEqual(image.size, [256, 256]);
      assert.deepEqual(image.bounds, expectedBounds);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
