// =====================================================================
// register.html – passenger registration
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class RegisterPage extends Page {
  msg = null;

  // Turn any Lebanese mobile number into one format: +961XXXXXXXX
  //   "03 123 456" → "+9613123456",  "71-123-456" → "+96171123456",  "+961 70 123456" → "+96170123456"
  // Returns null if it does not look like a Lebanese number (7 or 8 digits after +961).
  static normalisePhone(text) {
    let p = text.replace(/[\s\-().]/g, "");      // remove spaces, dashes, brackets, dots
    if (p.startsWith("00961")) p = "+" + p.slice(2);
    if (p.startsWith("961")) p = "+" + p;
    if (p.startsWith("+961")) p = p.slice(4);    // keep only the local part for now
    if (p.startsWith("0")) p = p.slice(1);       // "03…" → "3…"
    if (!/^\d{7,8}$/.test(p)) return null;
    return "+961" + p;
  }

  async init() {
    // 1. Navigation bar
    await BB.renderNav("register.html");
    if (!BB.db) return;                          // setup not done yet

    // Someone already logged in does not need a new account
    const current = await BB.getUser();
    if (current) { location.replace(BB.homeFor(current.type)); return; }

    this.msg = BB.$("#msg");
    this.bindForm();
  }

  showAlreadyRegistered() {
    this.msg.className = "alert alert-error";
    this.msg.innerHTML = 'This email already has an account. <a href="login.html">Log in instead.</a>';
  }

  // 2. Check the form, then create the account
  bindForm() {
    const msg = this.msg;
    BB.$("#regForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = BB.$("#fullName").value.trim();
      const email = BB.$("#email").value.trim();
      const phone = RegisterPage.normalisePhone(BB.$("#phone").value);
      const password = BB.$("#password").value;
      const password2 = BB.$("#password2").value;

      // Simple checks, one clear message at a time
      let problem = "";
      if (fullName.length < 2) problem = "Please type your full name.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problem = "Please type a valid email address.";
      else if (!phone) problem = "Please type a Lebanese mobile number, for example 03 123 456 or +961 71 123 456.";
      else if (password.length < 8) problem = "The password must have at least 8 characters.";
      else if (password !== password2) problem = "The two passwords are not the same.";
      if (problem) { BB.show(msg, problem, "error"); return; }

      const btn = BB.$("#regBtn");
      BB.busy(btn, true, "Creating account…");
      BB.show(msg, "");

      // The database trigger (handle_new_user) makes the users row as 'passenger'
      // from full_name and phone_no below
      const { data, error } = await BB.db.auth.signUp({
        email, password,
        options: {
          data: { full_name: fullName, phone_no: phone },
          emailRedirectTo: new URL("login.html", location.href).href
        }
      });
      BB.busy(btn, false);

      if (error) {
        if (/already registered/i.test(error.message || "")) this.showAlreadyRegistered();
        else BB.show(msg, BB.errText(error), "error");
        return;
      }
      // With email confirmation on, Supabase hides existing emails by returning a user with no identities
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        this.showAlreadyRegistered();
        return;
      }

      // 3. Logged in straight away → open the live map
      if (data.session) { location.href = "map.html"; return; }

      // Otherwise the user must confirm the email first
      BB.$("#regForm").classList.add("hidden");
      BB.$("#loginLink").classList.add("hidden");
      BB.$("#done").classList.remove("hidden");
    });
  }
}

RegisterPage.mount();
