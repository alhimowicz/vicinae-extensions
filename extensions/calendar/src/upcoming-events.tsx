import { Action, ActionPanel, Detail, Icon, List, showToast, Toast, useNavigation, type LaunchProps } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { cachedSnapshot, readCalendars, selectedCalendars } from "./calendar.ts";
import { eventSection, timeLabel, upcoming, type Snapshot } from "./events.ts";
import { EventActions, EventDetails, useEventActivation } from "./event-actions.tsx";
import SelectCalendars from "./select-calendars.tsx";

export default function UpcomingEvents(props: LaunchProps = {} as LaunchProps) {
  const { push } = useNavigation();
  const activate = useEventActivation();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  const mounted = useRef(true);
  const pending = useRef(props.launchContext);

  const reload = useCallback(async (manual = false) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    let toast: Toast | undefined;
    try {
      if (manual) toast = await showToast({ title: "Syncing calendars…", message: "Fetching updates from connected calendar services.", style: Toast.Style.Animated });
      const ids = await selectedCalendars();
      const cache = await cachedSnapshot(ids);
      if (!mounted.current) return;
      setSnapshot(cache);
      let fresh: Snapshot;
      let warning = "";
      try {
        fresh = await readCalendars(ids);
        if (fresh.errors.length) warning = "Some calendars could not sync. Cached events are kept where possible.\n\n" + fresh.errors.map((e) => `${fresh.calendars.find((c) => c.id === e.calendarId)?.name || "Calendar"}: ${e.message}`).join("\n");
      } catch (e) {
        if (!cache) throw e;
        fresh = cache;
        warning = `${String(e)}\n\nShowing cached events from ${new Date(cache.updatedAt).toLocaleString()}.`;
      }
      if (toast) {
        toast.style = warning ? Toast.Style.Failure : Toast.Style.Success;
        toast.title = warning ? "Some calendars could not sync" : "Calendars refreshed";
        toast.message = warning || `${upcoming(fresh.events).length} upcoming events · Updated ${new Date(fresh.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      if (!mounted.current) return;
      setError(warning);
      setSnapshot(fresh);
      const context = pending.current;
      pending.current = undefined;
      const event = upcoming(fresh.events).find((e) => e.id === context?.eventId);
      if (event) {
        const calendar = fresh.calendars.find((c) => c.id === event.calendarId);
        if (context?.show === "links") await activate(event, calendar);
        else push(<EventDetails event={event} calendar={calendar} />);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
      if (toast) { toast.style = Toast.Style.Failure; toast.title = "Calendar refresh failed"; toast.message = String(e); }
    } finally {
      busy.current = false;
      if (mounted.current) { setLoading(false); setNow(Date.now()); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const timer = setInterval(() => { setNow(Date.now()); void reload(); }, 60_000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [reload]);

  const controls = <>
    <Action title="Refresh Calendars" icon={Icon.ArrowClockwise} onAction={() => void reload(true)} shortcut={{ modifiers: ["ctrl"], key: "r" }} />
    <Action.Push title="Select Calendars" icon={Icon.Calendar} target={<SelectCalendars onSaved={() => void reload()} />} />
    {error && <Action.Push title="Calendar Status" icon={Icon.Info01} target={<Detail markdown={error} />} />}
  </>;
  const groups = new Map<string, ReturnType<typeof upcoming>>();
  for (const event of upcoming(snapshot?.events || [], now)) {
    if (filter !== "all" && event.calendarId !== filter) continue;
    const section = eventSection(event, now);
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section)!.push(event);
  }
  const updated = snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return <List isLoading={loading} navigationTitle={`Upcoming Events${loading ? " · Syncing calendars…" : error ? " · Sync warning" : updated ? ` · Updated ${updated}` : ""}`} searchBarPlaceholder="Search events, locations, calendars…" actions={<ActionPanel>{controls}</ActionPanel>} searchBarAccessory={<List.Dropdown tooltip="Filter calendar" value={filter} onChange={setFilter}>
    <List.Dropdown.Item title="All calendars" value="all" />
    {snapshot?.calendars.map((calendar) => <List.Dropdown.Item key={calendar.id} title={calendar.name} value={calendar.id} />)}
  </List.Dropdown>}>
    <List.EmptyView title={loading ? "Loading calendars…" : error ? "Calendar unavailable" : "No upcoming events"} description={error || "Your next seven days are clear. Use Select Calendars to choose sources."} icon={Icon.Calendar} actions={<ActionPanel>{controls}</ActionPanel>} />
    {error && snapshot?.events.length ? <List.Section title="Calendar status"><List.Item title="Some calendars could not refresh" subtitle="Cached events may be out of date" icon={Icon.Info01} actions={<ActionPanel><Action.Push title="Show Calendar Status" target={<Detail markdown={error} />} />{controls}</ActionPanel>} /></List.Section> : null}
    {[...groups].map(([section, events]) => <List.Section key={section} title={section}>{events.map((event) => {
      const calendar = snapshot?.calendars.find((c) => c.id === event.calendarId);
      return <List.Item key={event.id} id={event.id} title={event.title} subtitle={event.location || calendar?.name} keywords={[calendar?.name || "", event.location]} icon={{ source: Icon.Calendar, tintColor: /^#[0-9a-f]{6,8}$/i.test(calendar?.color || "") ? calendar!.color : "#3584e4" }} accessories={[{ text: timeLabel(event) }, { text: calendar?.name || "" }]} actions={<ActionPanel><EventActions event={event} calendar={calendar} />{controls}</ActionPanel>} />;
    })}</List.Section>)}
  </List>;
}
