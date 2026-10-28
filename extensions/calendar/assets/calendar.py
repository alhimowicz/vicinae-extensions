"""Read the user's EDS calendars; all account setup and sync remain with EDS."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import json
import sys
import threading

import gi

gi.require_version("ECal", "2.0")
gi.require_version("EDataServer", "1.2")
gi.require_version("ICalGLib", "3.0")
from gi.repository import ECal, EDataServer, Gio, ICalGLib


def date_string(value):
    return f"{value.get_year():04d}-{value.get_month():02d}-{value.get_day():02d}"


def properties(component):
    prop = component.get_first_property(ICalGLib.PropertyKind.ANY_PROPERTY)
    result = []
    while prop:
        result.append(prop)
        prop = component.get_next_property(ICalGLib.PropertyKind.ANY_PROPERTY)
    return result


def event_from_instance(component, start, end, calendar_id, zone):
    event = ECal.Component.new_from_icalcomponent(component.clone())
    if event.get_status() == ICalGLib.PropertyStatus.CANCELLED:
        return None
    summary = event.get_summary()
    all_day = start.is_date()
    rid = component.get_recurrenceid()
    conference = []
    url = ""
    for prop in properties(component):
        name = prop.get_property_name().upper()
        if name == "CONFERENCE" or name in {"X-GOOGLE-CONFERENCE", "X-MICROSOFT-SKYPETEAMSMEETINGURL", "X-MICROSOFT-ONLINEMEETINGEXTERNALLINK"}:
            conference.append(prop.get_value_as_string())
        if name == "URL":
            url = prop.get_value_as_string()
    start_zone = start.get_timezone() or zone
    end_zone = end.get_timezone() or zone
    return {
        "id": json.dumps([calendar_id, event.get_uid(), rid.as_ical_string() if rid and not rid.is_null_time() else start.as_ical_string()]),
        "uid": event.get_uid(),
        "calendarId": calendar_id,
        "title": summary.get_value() if summary and summary.get_value() else "Untitled event",
        "start": start.as_timet_with_zone(start_zone) * 1000,
        "end": end.as_timet_with_zone(end_zone) * 1000,
        "allDay": all_day,
        "startDate": date_string(start) if all_day else None,
        "endDate": date_string(end) if all_day else None,
        "location": event.get_location() or "",
        "description": "\n".join(text.get_value() or "" for text in event.get_descriptions() or []),
        "url": url,
        "conference": conference,
    }


def read_calendar(source, zone, start, end):
    cancel = Gio.Cancellable()
    timer = threading.Timer(6, cancel.cancel)
    timer.daemon = True
    timer.start()
    events = []
    try:
        client = ECal.Client.connect_sync(source, ECal.ClientSourceType.EVENTS, 1, cancel)
        client.set_default_timezone(zone)
        refresh_error = None
        if client.check_refresh_supported():
            try:
                client.refresh_sync(cancel)
            except Exception as error:
                refresh_error = {"calendarId": source.get_uid(), "message": str(error)}

        failures = []

        def on_instance(component, instance_start, instance_end, _data, _cancel):
            try:
                event = event_from_instance(component, instance_start, instance_end, source.get_uid(), zone)
                if event:
                    events.append(event)
                return True
            except Exception as error:
                failures.append(error)
                return False

        client.generate_instances_sync(start, end, cancel, on_instance, None)
        if failures:
            raise failures[0]
        if cancel.is_cancelled():
            raise TimeoutError("Calendar read timed out")
        return events, refresh_error
    except Exception as error:
        return [], {"calendarId": source.get_uid(), "message": str(error)}
    finally:
        timer.cancel()


def load(selection=None, metadata_only=False):
    registry = EDataServer.SourceRegistry.new_sync(None)
    sources = [source for source in registry.list_sources(EDataServer.SOURCE_EXTENSION_CALENDAR) if registry.check_enabled(source)]
    calendars = []
    for source in sources:
        extension = source.get_extension(EDataServer.SOURCE_EXTENSION_CALENDAR)
        calendars.append({"id": source.get_uid(), "name": source.get_display_name(), "color": extension.get_color() or "#3584e4", "selected": extension.get_selected()})
    calendars.sort(key=lambda calendar: calendar["name"].casefold())
    selected = set(selection if selection is not None else [calendar["id"] for calendar in calendars if calendar["selected"]])
    now = datetime.now().astimezone()
    zone = ICalGLib.Timezone.get_builtin_timezone(ECal.system_timezone_get_location()) or ICalGLib.Timezone.get_utc_timezone()
    start = int(now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    end = int((now + timedelta(days=7)).timestamp())
    events, errors = [], []
    if not metadata_only:
        with ThreadPoolExecutor(max_workers=4) as executor:
            reads = [executor.submit(read_calendar, source, zone, start, end) for source in sources if source.get_uid() in selected]
            for read in reads:
                instances, error = read.result()
                events.extend(instances)
                if error:
                    errors.append(error)
    return {"calendars": calendars, "events": events, "errors": errors, "updatedAt": int(now.timestamp() * 1000)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--calendars", type=json.loads)
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    if args.calendars is not None and (not isinstance(args.calendars, list) or not all(isinstance(value, str) for value in args.calendars)):
        parser.error("--calendars must be a JSON array of calendar IDs")
    json.dump(load(args.calendars, args.list), sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
