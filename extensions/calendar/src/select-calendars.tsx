import { Action, ActionPanel, Form, Icon, LocalStorage, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { readCalendars, selectedCalendars } from "./calendar.ts";
import type { Calendar } from "./events.ts";

export default function SelectCalendars({ onSaved }: { onSaved?: () => void } = {}) {
  const { pop } = useNavigation();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([readCalendars(undefined, true), selectedCalendars()]).then(([data, ids]) => {
      setCalendars(data.calendars);
      setSelected(ids ?? data.calendars.filter((c) => c.selected).map((c) => c.id));
    }).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, []);
  async function save(values: Record<string, unknown>) {
    try {
      const ids = calendars.filter((_, index) => values[`calendar-${index}`] === true).map((c) => c.id);
      await LocalStorage.setItem("calendar-ids", JSON.stringify(ids));
      onSaved?.();
      await showToast({ title: "Calendar selection saved", message: "Next Event updates within a minute.", style: Toast.Style.Success });
      pop();
    } catch (e) { await showToast({ title: "Could not save calendars", message: String(e), style: Toast.Style.Failure }); }
  }
  return <Form isLoading={loading} navigationTitle="Select Calendars" actions={!loading && !error && <ActionPanel><Action.SubmitForm title="Save Calendars" icon={Icon.CheckCircle} onSubmit={save} /></ActionPanel>}>
    <Form.Description text={error || (calendars.length ? "Choose calendars for your agenda and Next Event preview. Initially follows your GNOME calendar selection." : loading ? "Loading calendars…" : "No calendars found. Add a calendar in GNOME Calendar or GNOME Online Accounts, then reopen this command.")} />
    {!loading && calendars.map((calendar, index) => <Form.Checkbox key={calendar.id} id={`calendar-${index}`} label={calendar.name} defaultValue={selected.includes(calendar.id)} />)}
  </Form>;
}
