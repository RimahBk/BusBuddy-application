// =====================================================================
// messages.html – passenger and driver chat
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class MessagesPage extends Page {
  // -----------------------------------------------------------------
  // 1. Page state
  // -----------------------------------------------------------------
  me = "passenger";          // value of messages.sent_by for my messages
  conversations = [];        // rows from get_conversations()
  current = null;            // { trip_id, passenger_id } of the open chat
  listSig = "";              // fingerprint of the list, to redraw only when it changes
  chatSig = "";              // fingerprint of the open chat (count + last id)

  static keyOf(c) { return c.trip_id + "|" + c.passenger_id; }

  async init() {
    await BB.renderNav("messages.html");
    if (!BB.db) {                                               // setup not done yet (banner explains)
      BB.$("#conv-list").innerHTML = `<div class="empty">Your conversations will appear here once the site is connected.</div>`;
      return;
    }
    const user = await BB.requireRole(["passenger", "driver"]);
    if (!user) return;
    this.me = user.type === "driver" ? "driver" : "passenger";

    this.text = BB.$("#msg-text");
    this.bindList();
    this.bindSendForm();
    this.bindCall();

    // 7. Start: load the list, open the chat from the URL, then poll
    await this.loadList();
    const tripParam = BB.param("trip"), passParam = BB.param("passenger");
    if (tripParam && passParam) await this.openChat(Number(tripParam), passParam);

    // Every POLL_SECONDS: new messages in the open chat + unread counts in the list
    let first = true;
    const stopPolling = BB.poll(async () => {
      if (first) { first = false; return; }                        // we just loaded everything above
      await this.loadMessages();
      await this.loadList();
    }, BB.config.POLL_SECONDS);
    window.addEventListener("pagehide", stopPolling);
  }

  // -----------------------------------------------------------------
  // 2. Conversation list (one per trip + passenger, with unread count)
  // -----------------------------------------------------------------
  async loadList() {
    const keyOf = MessagesPage.keyOf;
    const { data, error } = await BB.db.rpc("get_conversations");
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    this.conversations = data || [];
    const sig = JSON.stringify(this.conversations.map((c) => [keyOf(c), c.unread, c.last_time]))
              + (this.current ? keyOf(this.current) : "");
    if (sig === this.listSig) return;                                 // nothing changed → no flicker
    this.listSig = sig;
    this.renderList();
    if (this.current) this.fillHeader();                              // the header uses the list data
  }

  renderList() {
    const keyOf = MessagesPage.keyOf;
    const box = BB.$("#conv-list");
    if (!this.conversations.length) {
      box.innerHTML = `<div class="empty">No conversations yet. Conversations appear for ${
        this.me === "driver" ? "passengers who booked your trips" : "trips you have booked"}.</div>`;
      return;
    }
    box.innerHTML = this.conversations.map((c) => {
      const text = c.last_message || "No messages yet";
      const preview = text.length > 70 ? text.slice(0, 70) + "…" : text;
      const active = this.current && keyOf(this.current) === keyOf(c) ? "active" : "";
      return `<button class="conv ${active}" data-trip="${c.trip_id}" data-passenger="${BB.esc(c.passenger_id)}">
          <div class="row-between">
            <span class="conv-name">${BB.esc(c.other_name)}</span>
            ${c.unread > 0 ? `<span class="unread" aria-label="${c.unread} unread">${c.unread}</span>` : ""}
          </div>
          <div class="muted">${BB.esc(c.route_name)} · ${BB.esc(BB.fmtDateTime(c.departure_time))}</div>
          <div class="conv-preview">${BB.esc(preview)}${c.last_time ? " · " + BB.esc(BB.fmtTime(c.last_time)) : ""}</div>
        </button>`;
    }).join("");
  }

  bindList() {
    BB.$("#conv-list").addEventListener("click", (e) => {
      const b = e.target.closest(".conv");
      if (b) this.openChat(Number(b.dataset.trip), b.dataset.passenger);
    });

    // Back button (phones only): return to the list
    BB.$("#back-btn").addEventListener("click", () => {
      this.current = null;
      history.replaceState(null, "", "messages.html");
      BB.$("#layout").classList.remove("has-chat");
      BB.$("#chat-box").classList.add("hidden");
      BB.$("#chat-empty").classList.remove("hidden");
      this.listSig = "";
      this.renderList();
    });
  }

  // -----------------------------------------------------------------
  // 3. Open a chat (from the list or from ?trip=&passenger= in the URL)
  // -----------------------------------------------------------------
  async openChat(tripId, passengerId) {
    this.current = { trip_id: tripId, passenger_id: passengerId };
    this.chatSig = "";
    history.replaceState(null, "", `messages.html?trip=${tripId}&passenger=${encodeURIComponent(passengerId)}`);
    BB.$("#layout").classList.add("has-chat");                   // phones: show the chat instead of the list
    BB.$("#chat-empty").classList.add("hidden");
    BB.$("#chat-box").classList.remove("hidden");
    BB.$("#chat").innerHTML = `<p class="muted">Loading messages…</p>`;
    BB.show("#send-alert", "");
    this.setSending(true);
    BB.$("#phone-line").classList.add("hidden");
    this.fillHeader();
    this.listSig = "";                                           // redraw the list to highlight this chat
    this.renderList();
    await this.loadMessages();
    await this.markRead();
  }

  // Name and trip in the chat header (taken from the conversation list)
  fillHeader() {
    const keyOf = MessagesPage.keyOf;
    const c = this.conversations.find((x) => keyOf(x) === keyOf(this.current));
    BB.$("#chat-name").textContent = c ? c.other_name : (this.me === "driver" ? "Passenger" : "Driver");
    BB.$("#chat-trip").textContent = c ? `${c.route_name} · ${BB.fmtDateTime(c.departure_time)}` : `Trip #${this.current.trip_id}`;
  }

  // -----------------------------------------------------------------
  // 4. Messages of the open chat
  // -----------------------------------------------------------------
  async loadMessages() {
    const keyOf = MessagesPage.keyOf;
    if (!this.current) return;
    const asked = keyOf(this.current);
    const { data, error } = await BB.db.from("messages").select("*")
      .eq("trip_id", this.current.trip_id).eq("passenger_id", this.current.passenger_id).order("date_time");
    if (!this.current || keyOf(this.current) !== asked) return;      // user switched chat meanwhile
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    const msgs = data || [];
    const last = msgs[msgs.length - 1];
    const sig = msgs.length + ":" + (last ? last.message_id : "");
    if (sig === this.chatSig) return;                                 // nothing new → keep the screen as it is
    const hadBefore = this.chatSig !== "";
    this.chatSig = sig;

    const box = BB.$("#chat");
    box.innerHTML = msgs.length
      ? msgs.map((m) => `<div class="bubble ${m.sent_by === this.me ? "mine" : "theirs"}">${BB.esc(m.content)}<span class="time">${BB.esc(BB.fmtTime(m.date_time))}</span></div>`).join("")
      : `<p class="muted">No messages yet. Say hello to start the conversation.</p>`;
    box.scrollTop = box.scrollHeight;                                 // jump to the newest message

    // A new message from the other person arrived while the chat is open → mark it read
    if (hadBefore && last && last.sent_by !== this.me) await this.markRead();
  }

  async markRead() {
    if (!this.current) return;
    const { error } = await BB.db.rpc("mark_read", { p_trip_id: this.current.trip_id, p_passenger_id: this.current.passenger_id });
    if (error) console.error(error);
    await this.loadList();                                            // unread count goes back to 0
  }

  // -----------------------------------------------------------------
  // 5. Send a message (UC-02). The database checks the booking and that
  //    the trip has not ended; its error text is shown above the box.
  // -----------------------------------------------------------------
  setSending(enabled) {
    this.text.disabled = !enabled;
    BB.$("#send-btn").disabled = !enabled;
  }

  bindSendForm() {
    const text = this.text;
    text.addEventListener("input", () => { BB.$("#count").textContent = text.value.length; });
    text.addEventListener("keydown", (e) => {                      // Enter sends, Shift+Enter = new line
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); BB.$("#send-form").requestSubmit(); }
    });

    BB.$("#send-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = text.value.trim();
      if (!content || !this.current || text.disabled) return;
      const btn = BB.$("#send-btn");
      BB.busy(btn, true, "Sending…");
      const { error } = await BB.db.rpc("send_message", {
        p_trip_id: this.current.trip_id, p_passenger_id: this.current.passenger_id, p_content: content
      });
      BB.busy(btn, false);
      if (error) {
        BB.show("#send-alert", BB.errText(error), "error");
        this.setSending(false);                                    // e.g. trip ended / no booking
        return;
      }
      text.value = "";
      BB.$("#count").textContent = "0";
      text.focus();
      await this.loadMessages();
      await this.loadList();
    });
  }

  // -----------------------------------------------------------------
  // 6. Call (UC-03): the number comes back only if a booking links us.
  //    Contact is by phone call or in-app message only.
  // -----------------------------------------------------------------
  bindCall() {
    BB.$("#call-btn").addEventListener("click", async () => {
      if (!this.current) return;
      const btn = BB.$("#call-btn");
      BB.busy(btn, true, "Getting number…");
      const { data: phone, error } = await BB.db.rpc("get_contact_phone", {
        p_trip_id: this.current.trip_id, p_passenger_id: this.current.passenger_id
      });
      BB.busy(btn, false);
      if (error) { BB.toast(BB.errText(error), "error"); return; }
      const who = this.me === "driver" ? "passenger" : "driver";
      if (!phone) { BB.toast(`The ${who}'s number is not available for this trip.`, "error"); return; }
      const clean = String(phone).replace(/[^+\d]/g, "");
      const line = BB.$("#phone-line");
      line.innerHTML = `${who === "driver" ? "Driver" : "Passenger"}'s number: <a href="tel:${BB.esc(clean)}"><b>${BB.esc(phone)}</b></a>`;
      line.classList.remove("hidden");                             // laptops cannot call, so show it
      location.href = "tel:" + clean;                              // opens the dialer on a phone
    });
  }
}

MessagesPage.mount();
