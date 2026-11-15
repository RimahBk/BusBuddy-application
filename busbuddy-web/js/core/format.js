// =====================================================================
// Format – turns raw values (dates, statuses, errors, phone numbers)
// into text or small pieces of HTML for the pages.
// =====================================================================
import { Dom } from "./dom.js";

export class Format {
  static time(iso) {
    return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–";
  }

  static date(iso) {
    return iso ? new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "–";
  }

  static dateTime(iso) {
    return iso ? Format.date(iso) + ", " + Format.time(iso) : "–";
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
