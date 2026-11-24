// =====================================================================
// Format – turns raw values (dates, statuses, errors, phone numbers)
// into text or small pieces of HTML for the pages.
// =====================================================================
import { Dom } from "./dom.js";

export class Format {
  // Every time is shown in Lebanon time, whatever time zone the phone or laptop is set to,
  // so a passenger abroad and the driver in Lebanon see the same departure time.
  static TIME_ZONE = (window.BB_CONFIG && window.BB_CONFIG.TIME_ZONE) || "Asia/Beirut";

  static time(iso) {
    return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: Format.TIME_ZONE }) : "–";
  }

  // Time with seconds (e.g. "last sent 12:04:10")
  static clock(iso) {
    return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: Format.TIME_ZONE }) : "–";
  }

  static date(iso) {
    return iso ? new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", timeZone: Format.TIME_ZONE }) : "–";
  }

  static dateTime(iso) {
    return iso ? Format.date(iso) + ", " + Format.time(iso) : "–";
  }

  // A key to group trips by day: "2026-11-17", the calendar day in Lebanon
  static dayKey(d) {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: Format.TIME_ZONE }).format(new Date(d));
  }

  // "Today", "Tomorrow" or a short date (days counted in Lebanon time)
  static dayLabel(iso) {
    const key = Format.dayKey(iso), now = Date.now();
    if (key === Format.dayKey(now)) return "Today";
    if (key === Format.dayKey(now + 24 * 3600000)) return "Tomorrow";
    return Format.date(iso);
  }

  static minutesAgo(iso) {
    return iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;
  }

  // Badge HTML for a status word (scheduled, active, delayed, completed, cancelled, booked, walk_on)
  static badge(status) {
    return `<span class="badge badge-${Dom.esc(status)}">${Dom.esc(String(status).replace("_", " "))}</span>`;
  }

  // Supabase error → readable text (our SQL functions raise plain English messages)
  static errText(error) {
    if (!error) return "";
    const m = error.message || String(error);
    if (m.includes("Failed to fetch")) return "No internet connection. Please try again.";
    return m.replace(/^FULL:\s*/, "");
  }

  // Phone link for calls (UC-03)
  static telLink(phone, label) {
    return phone
      ? `<a class="btn btn-outline btn-small" href="tel:${Dom.esc(phone.replace(/[^+\d]/g, ""))}">📞 ${Dom.esc(label || "Call")}</a>`
      : "";
  }
}
