// =====================================================================
// Ui – toast, confirm box, busy buttons and message boxes.
// No alert()/confirm(): they don't show in a plain Android WebView.
// =====================================================================
import { Dom } from "./dom.js";

export class Ui {
  static #toastTimer;

  // Small message at the bottom of the screen for 3.5 s (type: ok | error)
  static toast(text, type) {
    let el = document.getElementById("bb-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "bb-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = "show " + (type || "");
    clearTimeout(Ui.#toastTimer);
    Ui.#toastTimer = setTimeout(() => { el.className = ""; }, 3500);
  }

  // Yes / Back dialog. Resolves to true when the user presses the OK button.
  static confirmBox(message, okLabel) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "modal-backdrop";
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
          <p>${Dom.esc(message)}</p>
          <div class="row">
            <button class="btn btn-outline" data-a="no">Back</button>
            <button class="btn" data-a="yes">${Dom.esc(okLabel || "Yes")}</button>
          </div></div>`;
      back.addEventListener("click", (e) => {
        const a = e.target.getAttribute("data-a");
        if (a || e.target === back) { back.remove(); resolve(a === "yes"); }
      });
      document.body.appendChild(back);
    });
  }

  // Put a button into a "working…" state while a request runs
  static busy(btn, isBusy, text) {
    if (!btn) return;
    if (isBusy) { btn.dataset.label = btn.textContent; btn.textContent = text || "Please wait…"; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  // Show a message inside a box on the page (type: error | ok | info | warn). Empty text hides it.
  static show(el, text, type) {
    if (typeof el === "string") el = Dom.$(el);
    if (!el) return;
    if (!text) { el.className = "hidden"; el.textContent = ""; return; }
    el.className = "alert alert-" + (type || "info");
    el.textContent = text;
  }
}
