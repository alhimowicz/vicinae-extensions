import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { browserCommand, discoverBrowsers, flatpakAccessProblem, getProfiles, validateBrowser } from "../src/browsers.ts";
import { appIdPattern, executablePaths } from "../src/platform.ts";
import { createApp, listApps, updateApp } from "../src/apps.ts";
import { browser, runtime } from "./fixtures.ts";

function program(path: string, code: string): void {
  writeFileSync(path, `#!${process.execPath}\n${code}\n`);
  chmodSync(path, 0o755);
}

test("browser discovery supports native binaries, Flatpak installations and custom configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "web apps browsers "));
  const previousPath = process.env.PATH;
  const previousConfig = process.env.XDG_CONFIG_HOME;
  try {
    program(join(root, "google-chrome"), "process.exit(0)");
    program(join(root, "flatpak"), "if (process.argv[2] === 'list') console.log('com.brave.Browser\\ncom.google.Chrome');");
    process.env.PATH = root;
    process.env.XDG_CONFIG_HOME = join(root, "config");
    const found = discoverBrowsers();
    assert.deepEqual(found.map((item) => item.id), ["chrome", "chrome-flatpak", "brave-flatpak"]);
    assert.equal(found[0].userDataDir, join(root, "config/google-chrome"));
    assert.equal(found[0].executable, join(root, "google-chrome"));
    assert.equal(found[2].flatpakId, "com.brave.Browser");
    const custom = discoverBrowsers({ browserExecutable: process.execPath, browserDataDirectory: root })[0];
    assert.equal(custom.id, "custom");
    assert.equal(custom.userDataDir, root);
    assert.throws(() => discoverBrowsers({ browserExecutable: process.execPath }), /both/);
    assert.deepEqual(executablePaths("missing", root), []);
    assert.throws(() => validateBrowser({ ...custom, userDataDir: "relative/path" }));
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
    rmSync(root, { recursive: true, force: true });
  }
});

test("profiles come from the chosen browser, including custom profile names", () => {
  const root = mkdtempSync(join(tmpdir(), "web-app-profiles-"));
  try {
    const selected = { ...browser, userDataDir: root };
    writeFileSync(join(root, "Local State"), JSON.stringify({ profile: { last_used: "Work account", info_cache: { Default: { name: "Personal" }, "Work account": { name: "Work" }, "../invalid": { name: "Invalid" } } } }));
    assert.deepEqual(getProfiles(selected), { selected: "Work account", profiles: [{ directory: "Default", name: "Personal" }, { directory: "Work account", name: "Work" }] });
    assert.deepEqual(browserCommand(selected, "Work account", "--app=https://example.com/")[1], ["run", "com.google.Chrome", `--user-data-dir=${root}`, "--profile-directory=Work account", "--app=https://example.com/"]);
    assert.throws(() => getProfiles({ ...selected, userDataDir: join(root, "missing") }), /Open.*create a profile/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Flatpak setup checks active sandboxes before opening an installation page", () => {
  const root = mkdtempSync(join(tmpdir(), "web-app-flatpak-"));
  const previousData = process.env.XDG_DATA_HOME;
  try {
    process.env.XDG_DATA_HOME = root;
    const flatpak = join(root, "flatpak");
    const log = join(root, "calls.jsonl");
    const code = `const fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n'); if(args[0]==='ps') console.log('123 com.google.Chrome'); if(args[0]==='enter') process.exit(13);`;
    program(flatpak, code);
    const selected = { ...browser, executable: flatpak };
    assert.match(flatpakAccessProblem(selected) || "", /ALL its web-app windows/);
    const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(calls[1][0], "enter");
    assert.deepEqual(calls[1].slice(-2), [join(root, "applications"), join(root, "icons")]);
    assert.equal(calls.some((args) => args.includes("--new-window")), false);
    program(flatpak, "process.exit(0)");
    assert.equal(flatpakAccessProblem(selected), undefined);
    assert.equal(flatpakAccessProblem({ ...selected, flatpakId: undefined }), undefined);
  } finally {
    if (previousData === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = previousData;
    rmSync(root, { recursive: true, force: true });
  }
});

test("new launcher identities follow the selected browser; old IDs survive upgrades", () => {
  const root = mkdtempSync(join(tmpdir(), "web-app-identities-"));
  try {
    const brave = { ...browser, id: "brave-flatpak", flatpakId: "com.brave.Browser" };
    const app = createApp("Brave", "https://example.com/", "Default", root, { browser: brave, runtime });
    assert.ok(app.id.startsWith("com.brave.Browser.vicinae.a"));
    assert.ok(appIdPattern.test(app.id));
    const native = createApp("Native", "https://example.com/", "Work", root, { browser: { ...browser, flatpakId: undefined }, runtime });
    assert.ok(native.id.startsWith("io.vicinae.webapp.a"));
    assert.throws(() => updateApp(native, native.name, native.url, native.profile, { browser: brave }, root), /Create a new launcher/);
    const borderless = createApp("Borderless", "https://example.com/borderless", "Default", root, { frameless: true, runtime });
    assert.throws(() => updateApp(borderless, borderless.name, borderless.url, borderless.profile, { browser, runtime }, root), /Create a new launcher/);
    const legacy = createApp("Legacy", "https://legacy.example/", "Default", root);
    assert.equal(updateApp(legacy, legacy.name, legacy.url, legacy.profile, { ...legacy, browser, runtime }, root).id, legacy.id);
    writeFileSync(join(root, "io.vicinae.webapp.a" + "f".repeat(24) + ".desktop"), "invalid metadata");
    const errors: string[] = [];
    assert.equal(listApps(root, (error) => errors.push(error)).length, 4);
    assert.equal(errors.length, 1);
    assert.ok(appIdPattern.test(native.id));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
