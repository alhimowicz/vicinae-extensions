export interface Calendar {
  id: string;
  name: string;
  color: string;
  selected: boolean;
}

export interface CalendarEvent {
  id: string;
  uid: string;
  calendarId: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  location: string;
  description: string;
  url: string;
  conference: string[];
}

export interface Snapshot {
  calendars: Calendar[];
  events: CalendarEvent[];
  errors: { calendarId: string; message: string }[];
  updatedAt: number;
}

export function parseSnapshot(value: unknown): Snapshot {
  const data = value as Snapshot;
  if (!data || !Number.isFinite(data.updatedAt) || !Array.isArray(data.calendars) || !Array.isArray(data.events) || !Array.isArray(data.errors)
    || !data.calendars.every((c) => c && [c.id, c.name, c.color].every((v) => typeof v === "string") && typeof c.selected === "boolean")
    || !data.events.every((e) => e && [e.id, e.uid, e.calendarId, e.title, e.location, e.description, e.url].every((v) => typeof v === "string")
      && Number.isFinite(e.start) && Number.isFinite(e.end) && e.end >= e.start && typeof e.allDay === "boolean"
      && [e.startDate, e.endDate].every((v) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)))
      && (!e.allDay || (e.startDate !== null && e.endDate !== null))
      && Array.isArray(e.conference) && e.conference.every((v) => typeof v === "string"))
    || !data.errors.every((e) => e && typeof e.calendarId === "string" && typeof e.message === "string")) {
    throw new Error("Invalid calendar data. Try refreshing your calendars.");
  }
  return data;
}

function httpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Calendar text can contain non-URL values. */ }
}

function recognizedMeeting(value: string): boolean {
  const { hostname, pathname } = new URL(value);
  return (hostname === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(pathname))
    || ((hostname === "zoom.us" || hostname.endsWith(".zoom.us")) && /^\/(j|s|my)\//.test(pathname))
    || (["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"].includes(hostname) && /^\/(l\/|meet\/)/.test(pathname))
    || hostname === "meet.jit.si"
    || hostname.endsWith(".webex.com")
    || hostname === "whereby.com"
    || hostname === "meet.google.com" && pathname.startsWith("/lookup/");
}

export function meetingLinks(event: CalendarEvent): string[] {
  const conference = [...new Set(event.conference.map(httpsUrl).filter((url): url is string => Boolean(url)))];
  if (conference.length) return conference;
  const primary = httpsUrl(event.url);
  if (primary && recognizedMeeting(primary)) return [primary];
  const text = `${event.location}\n${event.description}`.replaceAll("&amp;", "&");
  const candidates = (text.match(/https:\/\/[^\s<>"']+/gi) || []).map((url) => httpsUrl(url.replace(/[.,;:!?\])}]+$/, "")));
  return [...new Set(candidates.filter((url): url is string => Boolean(url && recognizedMeeting(url))))];
}

export function localDate(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function upcoming(events: CalendarEvent[], now = Date.now()): CalendarEvent[] {
  const today = localDate(now);
  return events.filter((e) => e.allDay ? e.endDate! > today : e.end > now || e.start === e.end && e.start >= now)
    .sort((a, b) => {
      const day = (e: CalendarEvent) => (e.allDay ? e.startDate! : localDate(e.start)) < today ? today : e.allDay ? e.startDate! : localDate(e.start);
      const ongoing = (e: CalendarEvent) => Number(!e.allDay && e.start <= now && e.end > now);
      return ongoing(b) - ongoing(a) || day(a).localeCompare(day(b)) || Number(a.allDay) - Number(b.allDay) || a.start - b.start || a.title.localeCompare(b.title);
    });
}

export function timeLabel(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const format = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${format(event.start)}–${format(event.end)}`;
}

export function eventSection(event: CalendarEvent, now = Date.now()): string {
  if (!event.allDay && event.start <= now && event.end > now) return "Now";
  const day = event.allDay ? event.startDate! : localDate(event.start);
  if (day <= localDate(now)) return "Today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === localDate(tomorrow.getTime())) return "Tomorrow";
  return new Date(day + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function nextEventLabel(event: CalendarEvent, now = Date.now()): string {
  const when = event.allDay ? eventSection(event, now) + " · All day" : event.start <= now ? "Now" : `${eventSection(event, now)} ${new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const minutes = Math.ceil((event.start - now) / 60_000);
  return `${when} · ${event.title}${!event.allDay && minutes > 0 && minutes < 60 ? ` · in ${minutes} min` : ""}`;
}

export function mergeSnapshot(fresh: Snapshot, cached?: Snapshot): Snapshot {
  const failed = new Set(fresh.errors.map((e) => e.calendarId));
  const events = new Map(fresh.events.map((event) => [event.id, event]));
  for (const event of cached?.events || []) {
    if (failed.has(event.calendarId) && !events.has(event.id)) events.set(event.id, event);
  }
  return { ...fresh, events: [...events.values()] };
}
