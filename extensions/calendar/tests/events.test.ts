import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSection, meetingLinks, mergeSnapshot, nextEventLabel, parseSnapshot, upcoming, type CalendarEvent, type Snapshot } from "../src/events.ts";

const now = new Date(2026, 9, 28, 10, 0).getTime();
const event: CalendarEvent = { id: "event", uid: "uid", calendarId: "work", title: "Standup", start: now + 10 * 60_000, end: now + 40 * 60_000, allDay: false, startDate: null, endDate: null, location: "", description: "", url: "", conference: [] };
const snapshot: Snapshot = { calendars: [{ id: "work", name: "Work", color: "#3584e4", selected: true }], events: [event], errors: [], updatedAt: now };

test("conference URLs take precedence over incidental links", () => {
  assert.deepEqual(meetingLinks({ ...event, conference: ["https://video.example.org/room"], description: "https://zoom.us/j/123" }), ["https://video.example.org/room"]);
  assert.deepEqual(meetingLinks({ ...event, url: "https://meet.google.com/abc-defg-hij", description: "https://zoom.us/j/123" }), ["https://meet.google.com/abc-defg-hij"]);
});

test("finds and deduplicates meeting links in HTML and text", () => {
  assert.deepEqual(meetingLinks({ ...event, location: "Join https://zoom.us/j/123?pwd=a&amp;from=calendar.", description: '<a href="https://zoom.us/j/123?pwd=a&amp;from=calendar">Join</a>' }), ["https://zoom.us/j/123?pwd=a&from=calendar"]);
  assert.equal(meetingLinks({ ...event, description: "Meet https://teams.microsoft.com/l/meetup-join/123 and https://meet.google.com/abc-defg-hij" }).length, 2);
});

test("ignores unsafe schemes, credential URLs, lookalike domains and unrelated links", () => {
  for (const url of ["javascript:alert(1)", "file:///tmp/meeting", "http://zoom.us/j/1", "https://zoom.us.evil.test/j/1", "https://evilzoom.us/j/1", "https://name:password@zoom.us/j/1", "https://example.org/report"]) {
    assert.deepEqual(meetingLinks({ ...event, url, description: url }), [], url);
  }
});

test("ongoing and future events remain; ended events disappear", () => {
  const ongoing = { ...event, id: "ongoing", start: now - 10, end: now + 10 };
  assert.deepEqual(upcoming([{ ...event, id: "ended", end: now }, event, ongoing], now).map((e) => e.id), ["ongoing", "event"]);
  assert.equal(eventSection(ongoing, now), "Now");
  assert.match(nextEventLabel(event, now), /in 10 min/);
});

test("all-day end dates are exclusive and do not become UTC dates", () => {
  const allDay = { ...event, id: "all-day", allDay: true, startDate: "2026-10-27", endDate: "2026-10-29", start: now - 86_400_000 };
  assert.equal(upcoming([allDay], now).length, 1);
  assert.equal(upcoming([{ ...allDay, endDate: "2026-10-28" }], now).length, 0);
  assert.equal(eventSection(allDay, now), "Today");
  assert.equal(upcoming([allDay, event], now)[0].id, "event");
});

test("today's all-day events appear before tomorrow's timed events", () => {
  const allDay = { ...event, id: "all-day", allDay: true, startDate: "2026-10-28", endDate: "2026-10-29", start: now - 10_000 };
  const tomorrow = { ...event, id: "tomorrow", start: now + 86_400_000, end: now + 90_000_000 };
  assert.deepEqual(upcoming([tomorrow, allDay, event], now).map((e) => e.id), ["event", "all-day", "tomorrow"]);
});

test("only failed calendars retain cached events", () => {
  const cached = { ...snapshot, events: [event, { ...event, id: "old-personal", calendarId: "personal" }] };
  const fresh = { ...snapshot, events: [], errors: [{ calendarId: "work", message: "Offline" }] };
  assert.deepEqual(mergeSnapshot(fresh, cached).events, [event]);
  assert.deepEqual(mergeSnapshot({ ...fresh, errors: [] }, cached).events, []);
  assert.deepEqual(mergeSnapshot({ ...fresh, events: [{ ...event, title: "New title" }] }, cached).events, [{ ...event, title: "New title" }]);
});

test("rejects malformed helper data and corrupt caches", () => {
  assert.equal(parseSnapshot(snapshot), snapshot);
  for (const value of [null, {}, { ...snapshot, events: [{ ...event, start: "tomorrow" }] }, { ...snapshot, events: [{ ...event, end: -1 }] }, { ...snapshot, events: [{ ...event, allDay: true }] }, { ...snapshot, errors: [null] }]) {
    assert.throws(() => parseSnapshot(value), /Invalid calendar data/);
  }
});
