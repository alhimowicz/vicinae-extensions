import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp, desktopEntry, listApps, nativeApplicationId, normalizeApp, removeApp, updateApp } from "../src/apps.ts";
import { browser, runtime } from "./fixtures.ts";

test("only website URLs and safe profile names become launchers", () => {
  assert.equal(normalizeApp(" Calendar ", "example.com", "Default").url, "https://example.com/");
  for (const url of ["", "javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com", "https://example.com\nExec=bad"]) {
    assert.throws(() => normalizeApp("App", url, "Default"));
  }
  assert.throws(() => normalizeApp("App\nExec=bad", "example.com", "Default"));
  assert.throws(() => normalizeApp("App", "example.com", "../../other"));
});

test("create/list/remove preserves URL and profile without overwriting other launchers", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-webapps-"));
  try {
    const app = createApp("Example", "https://example.com/a?value=100%25&arg=$HOME", "Profile 1", directory);
    const other = join(directory, "other.desktop");
    writeFileSync(other, "unrelated");
    assert.deepEqual(listApps(directory), [app]);
    assert.throws(() => createApp("Renamed", app.url, app.profile, directory), /already has a launcher/);
    assert.equal(listApps(directory)[0].name, "Example");
    assert.throws(() => removeApp({ ...app, id: "../../other" }, directory));
    removeApp(app, directory);
    assert.deepEqual(readdirSync(directory), ["other.desktop"]);
    assert.equal(readFileSync(other, "utf8"), "unrelated");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("editing keeps the launcher ID and pins, and refuses duplicate URLs without changing the original", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-webapps-"));
  try {
    const original = createApp("Before", "https://example.com/before", "Default", directory);
    assert.ok(original.id.startsWith("com.google.Chrome."), "GNOME requires a Flatpak sandbox prefix to recognize Chrome web apps separately");
    createApp("Other", "https://example.com/other", "Default", directory);
    const edited = updateApp(original, "After", "https://example.com/after", "Profile 1", { frameless: true, runtime, icon: join(directory, "example icon.png"), iconSource: "https://example.com/icon.png" }, directory);
    assert.equal(edited.id, original.id);
    assert.deepEqual(listApps(directory).find((app) => app.id === original.id), edited);
    const entry = readFileSync(join(directory, `${original.id}.desktop`), "utf8");
    assert.ok(entry.includes(`StartupWMClass=${original.id}`));
    assert.equal(nativeApplicationId(original.id), original.id);
    execFileSync("desktop-file-validate", [join(directory, `${original.id}.desktop`)]);
    assert.throws(() => updateApp(edited, "Duplicate", "https://example.com/other", "Default", {}, directory), /already has/);
    assert.equal(readFileSync(join(directory, `${original.id}.desktop`), "utf8"), entry);
    assert.ok(readdirSync(directory).every((file) => file.endsWith(".desktop")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("existing Chrome launchers from the first version remain editable", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-webapps-"));
  try {
    const legacy = { id: "vicinae-webapp-" + "1".repeat(24), name: "ChatGPT", url: "https://chatgpt.com/", profile: "Default" };
    writeFileSync(join(directory, `${legacy.id}.desktop`), desktopEntry(legacy));
    const loaded = listApps(directory)[0];
    assert.equal(loaded.id, legacy.id);
    assert.equal(loaded.frameless, false);
    assert.equal(updateApp(loaded, "ChatGPT Work", loaded.url, loaded.profile, loaded, directory).name, "ChatGPT Work");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GNOME parses Exec arguments literally, including percent, quotes and shell syntax", () => {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-webapps-"));
  try {
    const app = normalizeApp("Quotes \\ and spaces", "https://example.com/a?x=100%25&y=$HOME&z=`touch`&q=%22", "Profile 1", { browser });
    const path = join(directory, `${app.id}.desktop`);
    writeFileSync(path, desktopEntry(app));
    execFileSync("desktop-file-validate", [path]);
    const parsed = JSON.parse(execFileSync(runtime.python!, ["-c", `
import gi,json,sys
from gi.repository import Gio,GLib
entry=GLib.KeyFile()
entry.load_from_file(sys.argv[1],GLib.KeyFileFlags.NONE)
command=entry.get_string('Desktop Entry','Exec')
print(json.dumps({'valid': Gio.DesktopAppInfo.new_from_filename(sys.argv[1]) is not None, 'args': GLib.shell_parse_argv(command)[1]}))
`, path], { encoding: "utf8" }));
    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.args, [browser.executable, "run", browser.flatpakId, `--user-data-dir=${browser.userDataDir}`, "--profile-directory=Profile 1", `--app=${app.url.replace(/%/g, "%%")}`]);

    const recorder = join(directory, "record-arguments");
    const recorded = join(directory, "arguments.json");
    writeFileSync(recorder, `#!${runtime.python}\nimport json,sys\nwith open(${JSON.stringify(recorded)}, 'w') as output:\n    json.dump(sys.argv[1:], output)\n`);
    chmodSync(recorder, 0o755);
    writeFileSync(path, desktopEntry(app).replace(`"${browser.executable}"`, `"${recorder}"`));
    execFileSync(runtime.python!, ["-c", `
import gi,sys,time,os
from gi.repository import Gio
Gio.DesktopAppInfo.new_from_filename(sys.argv[1]).launch([],None)
for _ in range(300):
    if os.path.exists(sys.argv[2]): break
    time.sleep(0.01)
else: raise RuntimeError('Launcher did not run')
`, path, recorded]);
    assert.deepEqual(JSON.parse(readFileSync(recorded, "utf8")), ["run", browser.flatpakId, `--user-data-dir=${browser.userDataDir}`, "--profile-directory=Profile 1", `--app=${app.url}`]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
