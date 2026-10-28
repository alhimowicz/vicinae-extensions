import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { createApp, listApps, normalizeApp, removeApp, updateApp } from "../src/apps.ts";
import { chromeAppId, discoverPwa, manifestLink, parseManifest, validatePwa } from "../src/pwa.ts";
import { findNativePwa } from "../src/pwa-native.ts";
import { syncInstalledPwa } from "../src/pwa-install.ts";
import { browser, runtime } from "./fixtures.ts";

const page = "https://example.com/work/";
const manifest = { name: "Example", start_url: "./start?from=app", id: "/identity#ignored", display: "standalone", scope: "/work/" };
const info = parseManifest(manifest, page + "manifest.json", page)!;

test("manifest links respect HTML comments, rel tokens, character references and base URLs", () => {
  assert.equal(manifestLink('<!-- <link rel="manifest" href="bad"> --><base href="/work/"><link href="manifest.json?a=1&amp;b=2" REL="alternate MANIFEST">', page), page + "manifest.json?a=1&b=2");
  assert.equal(manifestLink('<script>const fake = \'<link rel="manifest" href="bad">\';</script>', page), undefined);
  assert.equal(manifestLink("<html>No manifest</html>", page), undefined);
  assert.throws(() => manifestLink('<link rel="manifest" href="file:///etc/passwd">', page));
});

test("manifest identity is stable, same-origin and independently matches Chrome's ID algorithm", () => {
  assert.equal(chromeAppId("https://airhorner.com/?homescreen=1"), "mepckecgignpfokhpmhopohiikfbpnai", "Confirmed against a real Chrome installation");
  const independentlyHashed = execFileSync(runtime.python!, ["-c", "import hashlib,sys; print(''.join(chr(97+int(c,16)) for c in hashlib.sha256(hashlib.sha256(sys.argv[1].encode()).digest()).hexdigest()[:32]))", "https://example.com/identity"], { encoding: "utf8" }).trim();
  assert.equal(info.appId, independentlyHashed);
  assert.equal(info.manifestId, "https://example.com/identity");
  assert.equal(info.startUrl, page + "start?from=app");
  assert.equal(info.scope, page);
  assert.deepEqual(validatePwa(info, page), info);
  assert.throws(() => validatePwa({ ...info, appId: "a".repeat(32) }, page));
  assert.throws(() => validatePwa(info, "https://other.example/"));
  assert.equal(parseManifest({ ...manifest, start_url: "https://other.example/" }, page + "manifest.json", page), undefined);
  assert.equal(parseManifest({ ...manifest, display: "browser" }, page + "manifest.json", page), undefined);
  assert.equal(parseManifest({ ...manifest, name: "" }, page + "manifest.json", page), undefined);
  assert.equal(parseManifest({ ...manifest, id: "https://other.example/" }, page + "manifest.json", page)?.appId, chromeAppId(info.startUrl));
});

test("discovery handles real HTTP pages, missing manifests, login redirects and bounded downloads", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/manifest.json") response.end(JSON.stringify({ ...manifest, start_url: "/start", id: "/identity" }));
    else if (request.url === "/large") response.end(Buffer.alloc(2 * 1024 * 1024 + 1));
    else if (request.url === "/broken.json") response.end("not json");
    else if (request.url === "/broken") response.end('<link rel="manifest" href="/broken.json">');
    else if (request.url === "/login") { response.writeHead(302, { Location: `http://localhost:${(server.address() as { port: number }).port}/none` }); response.end(); }
    else response.end(request.url === "/none" ? "No manifest" : '<link rel="manifest" href="/manifest.json">');
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const detected = await discoverPwa(base);
    assert.equal(detected?.manifestId, base + "/identity");
    assert.equal(await discoverPwa(base + "/none"), undefined);
    assert.equal(await discoverPwa(base + "/login"), undefined);
    await assert.rejects(discoverPwa(base + "/large"), /too large/);
    await assert.rejects(discoverPwa(base + "/broken"), /JSON|Unexpected/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function nativeEntry(directory: string, profile: string, hidden = false): string {
  const path = join(directory, `com.google.Chrome.flextop.chrome-${info.appId}-${profile.replaceAll(" ", "_")}.desktop`);
  writeFileSync(path, `[Desktop Entry]\nType=Application\nName=Chrome Example\nExec="${browser.executable}" run --branch=stable --command=/app/bin/chrome com.google.Chrome "--profile-directory=${profile}" --app-id=${info.appId}\nStartupWMClass=chrome-${info.appId}-${profile.replaceAll(" ", "_")}\nNoDisplay=${hidden}\n`);
  return path;
}

test("only an actual Chrome shortcut in the selected profile upgrades a pending launcher", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-pwa-"));
  try {
    let app = createApp("Example", page, "Profile 1", directory, { browser, runtime, preferPwa: true, pwa: info, icon: join(directory, "padded-icon.png") });
    const ownPath = join(directory, app.id + ".desktop");
    nativeEntry(directory, "Default");
    assert.equal(findNativePwa(app, directory), undefined);
    assert.equal(syncInstalledPwa(app, directory).pwaDesktopId, undefined);
    assert.ok(readFileSync(ownPath, "utf8").includes(runtime.worker));
    const nativePath = nativeEntry(directory, "Profile 1");
    const native = findNativePwa(app, directory)!;
    assert.equal(native.profile, "Profile 1");
    app = syncInstalledPwa(app, directory);
    assert.equal(app.pwaDesktopId, native.desktopId);
    assert.equal(app.icon, join(directory, "padded-icon.png"));
    assert.equal(listApps(directory).length, 1);
    const upgraded = readFileSync(ownPath, "utf8");
    assert.ok(upgraded.includes(`StartupWMClass=chrome-${info.appId}-Profile_1`));
    assert.ok(readFileSync(nativePath, "utf8").includes("NoDisplay=true"));
    assert.equal(readFileSync(nativePath, "utf8").match(/X-Vicinae-Pwa-Owner=(.+)/)?.[1], app.id);
    execFileSync("desktop-file-validate", [ownPath]);
    assert.deepEqual(syncInstalledPwa(app, directory), app);
    const renamed = updateApp(app, "Renamed", app.url, app.profile, app, directory);
    assert.equal(renamed.id, app.id);
    assert.equal(renamed.pwaDesktopId, native.desktopId);
    assert.throws(() => updateApp(app, "Stale", app.url, app.profile, app, directory), /changed/);
    assert.equal(listApps(directory)[0].name, "Renamed");
    removeApp(renamed, directory);
    assert.ok(readFileSync(nativePath, "utf8").includes("NoDisplay=false"));
    assert.ok(!readFileSync(nativePath, "utf8").includes("X-Vicinae-Pwa-Owner"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("changing profiles restores the previous Chrome launcher; missing registrations fall back safely", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-pwa-"));
  try {
    let app = createApp("Example", page, "Default", directory, { browser, runtime, preferPwa: true, pwa: info });
    const source = nativeEntry(directory, "Default", true);
    app = syncInstalledPwa(app, directory);
    app = updateApp(app, app.name, app.url, "Profile 1", { browser, runtime, preferPwa: true }, directory);
    assert.equal(app.pwa, undefined);
    assert.ok(!readFileSync(source, "utf8").includes("X-Vicinae-Pwa-Owner"));
    assert.ok(readFileSync(source, "utf8").includes("NoDisplay=true"), "Originally hidden shortcuts stay hidden");
    app = updateApp(app, app.name, app.url, "Default", { browser, runtime, preferPwa: true, pwa: info }, directory);
    app = syncInstalledPwa(app, directory);
    unlinkSync(source);
    app = syncInstalledPwa(app, directory);
    assert.equal(app.pwaDesktopId, undefined);
    assert.equal(app.preferPwa, true);
    const borderless = normalizeApp(app.name, app.url, app.profile, { ...app, frameless: true }, app.id);
    assert.equal(borderless.pwa, undefined);
    assert.equal(borderless.preferPwa, false);
    assert.throws(() => normalizeApp(app.name, app.url, app.profile, { ...app, pwaDesktopId: "../../bad" }, app.id));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("native registrations resolve executable names from PATH, as Flextop-generated shortcuts do", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-pwa-path-"));
  const oldPath = process.env.PATH;
  try {
    process.env.PATH = dirname(browser.executable) + delimiter + (oldPath || "");
    const app = createApp("Example", page, "Default", directory, { browser, runtime, preferPwa: true, pwa: info });
    const source = nativeEntry(directory, "Default");
    writeFileSync(source, readFileSync(source, "utf8").replace(`"${browser.executable}"`, basename(browser.executable)));
    assert.equal(findNativePwa(app, directory)?.profile, "Default");
    const other = { ...app, browser: { ...browser, flatpakId: "com.brave.Browser" } };
    assert.equal(findNativePwa(other, directory), undefined);
  } finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
