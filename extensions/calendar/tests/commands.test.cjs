const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, readFileSync, rmSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { wrap } = require("node:module");
const { promisify } = require("node:util");
const vm = require("node:vm");

const bundle = resolve(__dirname, "../dist/calendar/next-event.js");
const start = Date.now() + 600_000;
const event = { id: "meeting", uid: "meeting", calendarId: "work", title: "Test meeting", start, end: start + 3_600_000, allDay: false, startDate: null, endDate: null, location: "", description: "", url: "", conference: [] };

async function runCommand(t, { background = false, links = [], browserError = false, requestedId, extraEvents = [] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "vicinae-calendar-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = { open: [], launch: [], metadata: [], close: 0, toast: [] };
  const api = {
    environment: { launchType: background ? "background" : "user", supportPath: directory, assetsPath: directory },
    LaunchType: { Background: "background", UserInitiated: "user" },
    getPreferenceValues: () => ({}),
    LocalStorage: { getItem: async () => undefined },
    updateCommandMetadata: async (metadata) => calls.metadata.push(metadata),
    launchCommand: async (options) => calls.launch.push(options),
    showToast: async (options) => calls.toast.push(options),
    Toast: { Style: { Failure: "failure" } },
    open: async (url) => { calls.open.push(url); if (browserError) throw new Error("Browser unavailable"); },
    closeMainWindow: async () => { calls.close++; },
  };
  const snapshot = { calendars: [{ id: "work", name: "Work", selected: true, color: "#3584e4" }], events: [{ ...event, conference: links }, ...extraEvents], errors: [], updatedAt: Date.now() };
  const execFile = () => { throw new Error("Unexpected real subprocess"); };
  execFile[promisify.custom] = async () => ({ stdout: JSON.stringify(snapshot) });
  const localRequire = (name) => name === "@vicinae/api" ? api : name === "node:child_process" ? { execFile } : require(name);
  const module = { exports: {} };
  const load = vm.runInNewContext(wrap(readFileSync(bundle, "utf8")), { process, console, URL, Buffer, setTimeout, clearTimeout });
  load(module.exports, localRequire, module, bundle, directory);
  await module.exports.default(requestedId ? { launchContext: { eventId: requestedId } } : undefined);
  assert.equal(statSync(join(directory, "agenda.json")).mode & 0o777, 0o600);
  return calls;
}

test("background refresh updates the preview without opening a meeting or a view", async (t) => {
  const calls = await runCommand(t, { background: true, links: ["https://meet.google.com/abc-defg-hij"] });
  assert.match(calls.metadata[0].subtitle, /Test meeting/);
  assert.equal(calls.open.length + calls.launch.length + calls.close, 0);
});

test("Enter opens the meeting and closes the launcher", async (t) => {
  const calls = await runCommand(t, { links: ["https://meet.google.com/abc-defg-hij"] });
  assert.deepEqual(calls.open, ["https://meet.google.com/abc-defg-hij"]);
  assert.equal(calls.close, 1);
  assert.equal(calls.launch.length, 0);
});

test("Enter sends ambiguous meeting links to the picker", async (t) => {
  const calls = await runCommand(t, { links: ["https://video.example.org/one", "https://video.example.org/two"] });
  assert.equal(calls.open.length, 0);
  assert.equal(calls.launch[0].name, "upcoming-events");
  assert.equal(calls.launch[0].context.show, "links");
});

test("Enter without a meeting link opens event details", async (t) => {
  const calls = await runCommand(t);
  assert.equal(calls.open.length, 0);
  assert.equal(calls.launch[0].context.show, "details");
});

test("a browser failure keeps the launcher open and offers event details", async (t) => {
  const calls = await runCommand(t, { links: ["https://video.example.org/one"], browserError: true });
  assert.equal(calls.close, 0);
  assert.equal(calls.toast.length, 1);
  assert.equal(calls.launch[0].context.show, "details");
});

test("a home-screen event opens its own meeting instead of an earlier event", async (t) => {
  const second = { ...event, id: "second", start: event.start + 3_600_000, end: event.end + 3_600_000, conference: ["https://video.example.org/second"] };
  const calls = await runCommand(t, { links: ["https://video.example.org/first"], requestedId: "second", extraEvents: [second] });
  assert.deepEqual(calls.open, ["https://video.example.org/second"]);
});

test("a removed home-screen event never opens a different meeting", async (t) => {
  const calls = await runCommand(t, { links: ["https://video.example.org/first"], requestedId: "removed" });
  assert.equal(calls.open.length, 0);
  assert.equal(calls.launch[0].name, "upcoming-events");
});
