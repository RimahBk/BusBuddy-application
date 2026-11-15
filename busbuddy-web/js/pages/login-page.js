// =====================================================================
// login.html – log in (passenger, driver, admin)
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class LoginPage extends Page {
  msg = null;

  // Where to go after logging in.
  // A "?next=" page is only accepted if it is a plain page name of this site
  // (like "bookings.html" or "messages.html?trip=3"), so the link cannot send people to another website.
  static safeNext() {
    const next = BB.param("next");
    if (!next) return null;
    const okShape = /^[a-z-]+\.html(\?[^\s]*)?$/i.test(next);
    if (!okShape || next.includes("/") || next.includes(":")) return null;
    return next;
  }

  // Read the user's type (passenger / driver / admin) from the users table
  static async homeOf(userId) {
    const { data, error } = await BB.db.from("users").select("type").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? data.type : null;
  }

  async init() {
    // 1. Navigation bar; hide the app card when we are already inside the Android app
    await BB.renderNav("login.html");
    if (BB.inApp) BB.$("#appCard").classList.add("hidden");
    if (!BB.db) return;                          // setup not done yet

    this.msg = BB.$("#msg");
    if (BB.param("next")) BB.show(this.msg, "Please log in to continue.", "info");

    // 2. Already logged in? Go straight to the right page
    const current = await BB.getUser();
    if (current) { location.replace(LoginPage.safeNext() || BB.homeFor(current.type)); return; }

    this.bindPasswordToggle();
    this.bindLoginForm();
    this.bindForgotPassword();
  }

  // 3. Show / hide the password
  bindPasswordToggle() {
    BB.$("#togglePw").addEventListener("click", (e) => {
      const input = BB.$("#password");
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      e.target.textContent = hidden ? "Hide" : "Show";
      e.target.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
    });
  }

  // 4. Log in
  bindLoginForm() {
    const msg = this.msg;
    BB.$("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = BB.$("#email").value.trim();
      const password = BB.$("#password").value;
      if (!email || !password) { BB.show(msg, "Please type your email and password.", "error"); return; }

      const btn = BB.$("#loginBtn");
      BB.busy(btn, true, "Logging in…");
      BB.show(msg, "");
      try {
        const { data, error } = await BB.db.auth.signInWithPassword({ email, password });
        if (error) {
          const wrong = /invalid login credentials/i.test(error.message || "");
          const unconfirmed = /email not confirmed/i.test(error.message || "");
          BB.show(msg, wrong ? "Wrong email or password."
                     : unconfirmed ? "Please confirm your email first (check your inbox), then log in."
                     : BB.errText(error), "error");
          return;
        }

        // Every account needs a row in the users table (it holds the user type)
        const type = await LoginPage.homeOf(data.user.id);
        if (!type) {
          await BB.db.auth.signOut();
          BB.show(msg, "Your account has no BusBuddy profile yet. Contact the administrator.", "error");
          return;
        }

        // Full page load, so the next page reads the new login fresh
        location.href = LoginPage.safeNext() || BB.homeFor(type);
      } catch (err) {
        BB.show(msg, BB.errText(err), "error");
      } finally {
        BB.busy(btn, false);
      }
    });
  }

  // 5. Forgot password: Supabase emails a link that opens reset-password.html
  bindForgotPassword() {
    const msg = this.msg;
    BB.$("#forgotBtn").addEventListener("click", async (e) => {
      const email = BB.$("#email").value.trim();
      if (!email) { BB.show(msg, "Type your email above first, then press \"Forgot password?\".", "error"); BB.$("#email").focus(); return; }
      BB.busy(e.target, true, "Sending…");
      const { error } = await BB.db.auth.resetPasswordForEmail(email, {
        redirectTo: new URL("reset-password.html", location.href).href
      });
      BB.busy(e.target, false);
      // Same message whether or not the email exists (we don't reveal who has an account),
      // except for a network problem, which the user needs to know about
      if (error && /fetch/i.test(error.message || "")) { BB.show(msg, BB.errText(error), "error"); return; }
      BB.show(msg, "If this email has an account, a reset link is on its way.", "ok");
    });
  }
}

LoginPage.mount();
