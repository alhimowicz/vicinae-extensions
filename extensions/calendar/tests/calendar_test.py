import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("calendar_helper", Path(__file__).resolve().parents[1] / "assets/calendar.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
ICal = helper.ICalGLib


def component(*fields):
    return ICal.Component.new_from_string("\r\n".join(["BEGIN:VEVENT", "UID:fixture", *fields, "END:VEVENT", ""]))


class CalendarTests(unittest.TestCase):
    def event(self, comp):
        return helper.event_from_instance(comp, comp.get_dtstart(), comp.get_dtend(), "work", ICal.Timezone.get_utc_timezone())

    def test_conference_metadata_and_escaped_description(self):
        event = self.event(component("DTSTART:20261028T100000Z", "DTEND:20261028T110000Z", "SUMMARY:Standup", "LOCATION:Room 1", "DESCRIPTION:Join\\nhttps://zoom.us/j/123", "CONFERENCE;VALUE=URI:https://meet.google.com/abc-defg-hij", "URL:https://example.org/event"))
        self.assertEqual(event["title"], "Standup")
        self.assertEqual(event["conference"], ["https://meet.google.com/abc-defg-hij"])
        self.assertEqual(event["description"], "Join\nhttps://zoom.us/j/123")
        self.assertEqual(event["url"], "https://example.org/event")
        self.assertEqual(event["end"] - event["start"], 3_600_000)

    def test_cancelled_events_are_omitted(self):
        self.assertIsNone(self.event(component("DTSTART:20261028T100000Z", "DTEND:20261028T110000Z", "STATUS:CANCELLED")))

    def test_all_day_dates_and_exclusive_end(self):
        event = self.event(component("DTSTART;VALUE=DATE:20261028", "DTEND;VALUE=DATE:20261030"))
        self.assertTrue(event["allDay"])
        self.assertEqual(event["startDate"], "2026-10-28")
        self.assertEqual(event["endDate"], "2026-10-30")
        self.assertEqual(event["title"], "Untitled event")

    def test_recurring_instances_keep_wall_time_across_dst(self):
        comp = component("DTSTART;TZID=Europe/Warsaw:20261024T100000", "DTEND;TZID=Europe/Warsaw:20261024T110000", "RRULE:FREQ=DAILY;COUNT=3", "EXDATE;TZID=Europe/Warsaw:20261026T100000")
        zone = ICal.Timezone.get_builtin_timezone("Europe/Warsaw")
        events = []

        def collect(comp, start, end, _data, _cancel):
            events.append(helper.event_from_instance(comp, start, end, "work", zone))
            return True

        helper.ECal.recur_generate_instances_sync(comp, ICal.Time.new_from_string("20261023T000000Z"), ICal.Time.new_from_string("20261028T000000Z"), collect, None, lambda tzid, *_: ICal.Timezone.get_builtin_timezone(tzid), None, zone, None)
        self.assertEqual(len(events), 2)
        self.assertEqual(events[1]["start"] - events[0]["start"], 25 * 3_600_000)
        self.assertNotEqual(events[0]["id"], events[1]["id"])

    def test_reads_request_remote_sync_before_querying_events(self):
        source = Mock()
        source.get_uid.return_value = "work"
        client = Mock()
        client.check_refresh_supported.return_value = True
        with patch.object(helper.ECal.Client, "connect_sync", return_value=client):
            events, error = helper.read_calendar(source, ICal.Timezone.get_utc_timezone(), 0, 100)
        self.assertEqual(events, [])
        self.assertIsNone(error)
        calls = [call[0] for call in client.mock_calls]
        self.assertLess(calls.index("refresh_sync"), calls.index("generate_instances_sync"))

    def test_offline_sync_keeps_local_events_and_reports_failure(self):
        source = Mock()
        source.get_uid.return_value = "work"
        client = Mock()
        client.check_refresh_supported.return_value = True
        client.refresh_sync.side_effect = RuntimeError("Offline")
        comp = component("DTSTART:20261028T100000Z", "DTEND:20261028T110000Z")
        def generate(_start, _end, cancel, callback, _data):
            callback(comp, comp.get_dtstart(), comp.get_dtend(), None, cancel)
        client.generate_instances_sync.side_effect = generate
        with patch.object(helper.ECal.Client, "connect_sync", return_value=client):
            events, error = helper.read_calendar(source, ICal.Timezone.get_utc_timezone(), 0, 100)
        self.assertEqual(len(events), 1)
        self.assertEqual(error, {"calendarId": "work", "message": "Offline"})


if __name__ == "__main__":
    unittest.main()
