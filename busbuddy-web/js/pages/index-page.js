// =====================================================================
// index.html – welcome page
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class IndexPage extends Page {
  async init() {
    // 1. Draw the top navigation bar (no item is highlighted on the welcome page)
    await BB.renderNav("index.html");
    if (!BB.db) return;                       // setup not done yet – the banner explains

    // 2. If someone is already logged in, swap "Log in / Create an account"
    //    for one button that takes them to their own home page
    const user = await BB.getUser();
    if (user) {
      BB.$("#homeBtn").href = BB.homeFor(user.type);
      BB.$("#guestLinks").classList.add("hidden");
      BB.$("#userLinks").classList.remove("hidden");
    }
  }
}

IndexPage.mount();
