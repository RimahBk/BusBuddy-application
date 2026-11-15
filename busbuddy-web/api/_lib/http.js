// =====================================================================
// Small HTTP helpers for the server function.
// (Files under api/_lib/ are NOT turned into URLs by Vercel: the leading "_" hides them.)
// =====================================================================

// An error that should be sent back to the browser with this HTTP status code
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Send an error back as JSON with an HTTP status code
export const fail = (status, message) => Response.json({ error: message }, { status });
