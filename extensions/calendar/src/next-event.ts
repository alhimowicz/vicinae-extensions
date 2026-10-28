import { environment, LaunchType, launchCommand, showToast, Toast, updateCommandMetadata, type LaunchProps } from "@vicinae/api";
import { cachedSnapshot, readCalendars, selectedCalendars } from "./calendar.ts";
import { meetingLinks, nextEventLabel, upcoming } from "./events.ts";
import { openMeeting } from "./event-actions.tsx";

export default async function NextEvent(props?: LaunchProps) {
  const background = environment.launchType === LaunchType.Background;
  try {
    const ids = await selectedCalendars();
    let snapshot;
    let cached = false;
    try { snapshot = await readCalendars(ids); }
    catch (error) {
      snapshot = await cachedSnapshot(ids);
      if (!snapshot) throw error;
      cached = true;
    }
    const events = upcoming(snapshot.events);
    const next = events.find((item) => !item.allDay) || events[0];
    const requestedId = props?.launchContext?.eventId;
    const event = typeof requestedId === "string" ? events.find((item) => item.id === requestedId) : next;
    const stale = cached || snapshot.errors.length > 0;
    await updateCommandMetadata({ subtitle: next ? `${stale ? "Cached · " : ""}${nextEventLabel(next)}` : stale ? "Calendar unavailable · open agenda" : "No upcoming events" });
    if (background) return;
    if (event) {
      const links = meetingLinks(event);
      if (links.length === 1) {
        try { await openMeeting(links[0]); return; }
        catch (error) { await showToast({ title: "Could not open meeting", message: String(error), style: Toast.Style.Failure }); }
      }
      await launchCommand({ name: "upcoming-events", type: LaunchType.UserInitiated, context: { eventId: event.id, show: links.length > 1 ? "links" : "details" } });
    } else await launchCommand({ name: "upcoming-events", type: LaunchType.UserInitiated });
  } catch (error) {
    await updateCommandMetadata({ subtitle: "Calendar unavailable · open agenda" });
    if (!background) {
      await showToast({ title: "Calendar unavailable", message: String(error), style: Toast.Style.Failure });
      await launchCommand({ name: "upcoming-events", type: LaunchType.UserInitiated });
    }
  }
}
