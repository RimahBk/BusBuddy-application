// =====================================================================
// Banners – the yellow "Setup needed" box and the thin demo-mode bar.
// =====================================================================
import { Ui } from "./ui.js";
import { DemoStore } from "../demo/demo-store.js";

export class Banners {
  #connection;

  constructor(connection) {
    this.#connection = connection;
  }

  // Shows a yellow banner if config.js still has the placeholder values
  setup() {
    if (this.#connection.demo) return this.demo();
    if (this.#connection.configured) return;
    const main = document.querySelector("main") || document.body;
    const div = document.createElement("div");
    div.className = "alert alert-warn";
    div.innerHTML = "<b>Setup needed:</b> put your Supabase URL and publishable key in <code>js/config.js</code>.";
    main.prepend(div);
  }

  // Demo mode: a thin bar under the menu; on the log-in page it also lists the demo accounts
  demo() {
    const page = location.pathname.split("/").pop() || "index.html";
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = "Demo mode · sample data, works offline · <button type='button' id='bb-demo-reset'>Reset demo</button>"
      + (page === "login.html" ? "<br>Demo accounts (any password): <b>rami@busbuddy.test</b> passenger · "
         + "<b>driver@busbuddy.test</b> driver · <b>admin@busbuddy.test</b> admin" : "");
    const top = document.getElementById("topbar");
    if (top) top.after(bar); else document.body.prepend(bar);
    bar.querySelector("#bb-demo-reset").addEventListener("click", Banners.resetDemo);
  }

  // "Reset demo" (in the demo bar and in the menu): ask, then start again from the sample data
  static async resetDemo() {
    if (!(await Ui.confirmBox("Start the demo again with the original sample data? You will be logged out.", "Reset"))) return;
    DemoStore.reset();
    location.href = "index.html";
  }
}
