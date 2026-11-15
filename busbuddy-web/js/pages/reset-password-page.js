// =====================================================================
// reset-password.html – new password after the email link
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class ResetPasswordPage extends Page {
  static LINK_TIMEOUT_MS = 3000;
  msg = null;
  decided = false;

  async init() {
    // 1. Navigation bar
    await BB.renderNav("reset-password.html");
    if (!BB.db) { BB.$("#checking").classList.add("hidden"); return; }   // setup not done yet

    this.msg = BB.$("#msg");

    // 2. The link in the email carries a recovery session in the URL.
    //    supabase-js reads it and tells us with the PASSWORD_RECOVERY event…
    BB.db.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") this.showForm();
    });
    //    …or the session may already be stored by the time this code runs
    const { data } = await BB.db.auth.getSession();
    if (data && data.session) this.showForm();

    // 3. Nothing after ~3 seconds → the link is wrong or too old
    setTimeout(() => this.showBadLink(), ResetPasswordPage.LINK_TIMEOUT_MS);

    this.bindForm();
  }

  // Show the form (the email link gave us a recovery session)
  showForm() {
    if (this.decided) return;
    this.decided = true;
    BB.$("#checking").classList.add("hidden");
    BB.$("#pwForm").classList.remove("hidden");
  }

  showBadLink() {
    if (this.decided) return;
    this.decided = true;
    BB.$("#checking").classList.add("hidden");
    BB.$("#badLink").classList.remove("hidden");
  }

  // 4. Save the new password
  bindForm() {
    const msg = this.msg;
    BB.$("#pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = BB.$("#password").value;
      const password2 = BB.$("#password2").value;
      if (password.length < 8) { BB.show(msg, "The password must have at least 8 characters.", "error"); return; }
      if (password !== password2) { BB.show(msg, "The two passwords are not the same.", "error"); return; }

      const btn = BB.$("#saveBtn");
      BB.busy(btn, true, "Saving…");
      BB.show(msg, "");
      const { error } = await BB.db.auth.updateUser({ password });
      BB.busy(btn, false);
      if (error) { BB.show(msg, BB.errText(error), "error"); return; }

      // Sign out so the user logs in fresh with the new password
      await BB.db.auth.signOut();
      BB.$("#pwForm").classList.add("hidden");
      BB.$("#done").classList.remove("hidden");
    });
  }
}

ResetPasswordPage.mount();
