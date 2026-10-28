import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createApp, listApps } from "../src/apps.ts";
import { parseManifest } from "../src/pwa.ts";
import { runtime } from "./fixtures.ts";

test("the packaged helper preserves profiles, adopts registered PWAs and falls back after removal", async () => {
  const root = mkdtempSync(join(tmpdir(), "web apps worker "));
  const directory = join(root, "launchers");
  mkdirSync(directory);
  const recorded = join(root, "arguments.json");
  const program = join(root, "fake browser");
  writeFileSync(program, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(recorded)},JSON.stringify(process.argv.slice(2)));\n`);
  chmodSync(program, 0o755);
  const browser = { id: "custom", name: "Test Browser", executable: program, userDataDir: join(root, "browser data") };
  const pwa = parseManifest({ name: "Example", start_url: "/", id: "/", display: "standalone" }, "https://example.com/manifest.json", "https://example.com/")!;
  const app = createApp("Example", "https://example.com/", "Work", directory, { browser, runtime, preferPwa: true, pwa });
  const launcher = join(directory, app.id + ".desktop");
  async function launch(): Promise<string[]> {
    if (existsSync(recorded)) unlinkSync(recorded);
    execFileSync(runtime.node, [runtime.worker, "launch", launcher], { timeout: 5000 });
    for (let i = 0; i < 50 && !existsSync(recorded); i++) await delay(50);
    return JSON.parse(readFileSync(recorded, "utf8"));
  }
  let watcher;
  try {
    assert.deepEqual(await launch(), [`--user-data-dir=${browser.userDataDir}`, "--profile-directory=Work", "--app=https://example.com/"]);
    watcher = spawn(runtime.node, [runtime.worker, "watch", launcher], { stdio: "ignore" });
    await delay(100);
    const source = join(directory, `chrome-${pwa.appId}-Work.desktop`);
    writeFileSync(source, `[Desktop Entry]\nType=Application\nName=Example\nExec="${program}" "--user-data-dir=${browser.userDataDir}" --profile-directory=Work --app-id=${pwa.appId}\n`);
    for (let i = 0; i < 50 && !listApps(directory)[0].pwaDesktopId; i++) await delay(50);
    assert.equal(listApps(directory)[0].pwaDesktopId, `chrome-${pwa.appId}-Work`);
    assert.match(readFileSync(source, "utf8"), /NoDisplay=true/);
    assert.equal((await launch()).at(-1), `--app-id=${pwa.appId}`);
    unlinkSync(source);
    assert.equal((await launch()).at(-1), "--app=https://example.com/");
    assert.equal(listApps(directory)[0].pwaDesktopId, undefined);
    assert.equal(listApps(directory)[0].id, app.id);
    const borderless = createApp("Borderless", "https://example.com/borderless", "Default", directory, { frameless: true, runtime: { ...runtime, python: program } });
    unlinkSync(recorded);
    execFileSync(runtime.node, [runtime.worker, "launch", join(directory, borderless.id + ".desktop")], { timeout: 5000 });
    for (let i = 0; i < 50 && !existsSync(recorded); i++) await delay(50);
    assert.deepEqual(JSON.parse(readFileSync(recorded, "utf8")), [runtime.native, join(directory, borderless.id + ".desktop")], "Cached browser launch requests must respect an edited borderless mode");
  } finally { watcher?.kill(); rmSync(root, { recursive: true, force: true }); }
});
