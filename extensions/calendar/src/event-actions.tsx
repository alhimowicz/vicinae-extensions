import { Action, ActionPanel, closeMainWindow, Detail, Icon, List, open, showToast, Toast, useNavigation } from "@vicinae/api";
import { spawn } from "node:child_process";
import { meetingLinks, timeLabel, type Calendar, type CalendarEvent } from "./events.ts";

export async function openMeeting(url: string): Promise<void> {
  await open(url);
  await closeMainWindow();
}

async function openCalendar(event: CalendarEvent): Promise<void> {
  try {
    const date = event.allDay ? event.startDate! : new Date(event.start).toISOString();
    await new Promise<void>((resolve, reject) => {
      const child = spawn("gnome-calendar", ["--date", date], { detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => { child.unref(); resolve(); });
    });
    await closeMainWindow();
  } catch {
    await showToast({ title: "Could not open GNOME Calendar", message: "Open your calendar application to view this event.", style: Toast.Style.Failure });
  }
}

function MeetingLinks({ event }: { event: CalendarEvent }) {
  return <List navigationTitle={`Join ${event.title}`} searchBarPlaceholder="Choose a meeting link…">
    {meetingLinks(event).map((url) => <List.Item key={url} title={new URL(url).hostname} subtitle={url} icon={Icon.Link} actions={<ActionPanel>
      <Action title="Join Meeting" icon={Icon.Link} onAction={() => void openMeeting(url).catch((error) => showToast({ title: "Could not open meeting", message: String(error), style: Toast.Style.Failure }))} />
      <Action.CopyToClipboard title="Copy Meeting Link" content={url} />
    </ActionPanel>} />)}
  </List>;
}

export function useEventActivation() {
  const { push } = useNavigation();
  return async (event: CalendarEvent, calendar?: Calendar) => {
    const links = meetingLinks(event);
    if (links.length > 1) push(<MeetingLinks event={event} />);
    else if (links.length === 1) {
      try { await openMeeting(links[0]); }
      catch (error) {
        await showToast({ title: "Could not open meeting", message: String(error), style: Toast.Style.Failure });
        push(<EventDetails event={event} calendar={calendar} />);
      }
    } else push(<EventDetails event={event} calendar={calendar} />);
  };
}

export function EventDetails({ event, calendar }: { event: CalendarEvent; calendar?: Calendar }) {
  // Calendar descriptions are untrusted text; prevent embedded HTML/images from loading.
  const plain = (value: string) => value.replace(/<[^>]*>/g, "").replace(/[\\`*_{}[\]()#+!|>]/g, "\\$&");
  const date = event.allDay ? `${event.startDate} · All day` : new Date(event.start).toLocaleString() + " · " + timeLabel(event);
  return <Detail navigationTitle={event.title} markdown={`# ${plain(event.title)}\n\n${plain(date)}\n\n${plain(calendar?.name || "")}\n\n${plain(event.location)}\n\n${plain(event.description)}`} actions={<ActionPanel><EventActions event={event} calendar={calendar} details /></ActionPanel>} />;
}

export function EventActions({ event, calendar, details = false }: { event: CalendarEvent; calendar?: Calendar; details?: boolean }) {
  const activate = useEventActivation();
  const links = meetingLinks(event);
  return <>
    {links.length > 0 && <Action title="Join Meeting" icon={Icon.Link} onAction={() => void activate(event, calendar)} />}
    {!details && <Action.Push title="Event Details" icon={Icon.Info01} target={<EventDetails event={event} calendar={calendar} />} />}
    {links.length === 1 && <Action.CopyToClipboard title="Copy Meeting Link" content={links[0]} />}
    <Action title="Open Calendar" icon={Icon.Calendar} onAction={() => void openCalendar(event)} />
  </>;
}
