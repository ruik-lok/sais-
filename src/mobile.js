// ORBITAL mobile controller (feature/visual-redesign, mobile agent).
//
// Only the hooks agreed in REDESIGN_PLAN.md section 1 are used:
//   #nav-toggle   - opens/closes the drawer (body[data-nav-open])
//   #nav-scrim    - click closes the drawer
//   #sheet-handle - pointer drag changes body[data-sheet]
//   #info-sheet   - bottom-sheet container (fallback: #info itself)
//   #time-float   - floating time controller, second-row expand/collapse
//
// This file creates NO DOM elements and changes NO desktop behaviour:
// every hook lookup is null-guarded, so if the desktop agent has not
// landed a hook yet, that feature simply stays unwired and the rest of
// the page (and the other features below) keeps working. In particular:
//   - with no #nav-toggle / #nav-scrim, the drawer cannot be opened yet
//     (desktop agent must add the hooks; mobile.css already styles the
//     drawer once they exist);
//   - with no #sheet-handle, there is no drag (the sheet still renders
//     collapsed via mobile.css);
//   - with no toggle inside/near #time-float, the controller stays fully
//     expanded: a second row is never hidden without a way to reopen it.
//
// Drawer close paths: #nav-scrim click, tapping a nav item, and Escape
// (capture phase, stopped, so main.js does not ALSO fire "back to
// overview" on the same keypress; targets inside INPUT / BUTTON /
// SELECT / TEXTAREA are left alone, mirroring main.js's own guard).
// The drawer toggle keeps working while open because mobile.css raises
// #nav-toggle above the scrim (z-index 61 vs 50).
//
// Sheet drag: pointer events on #sheet-handle only (touch-action:none
// is set in mobile.css, so a drag never fights page scroll). While
// dragging, the sheet follows the finger with an inline translateY
// (transform only); on release the inline style is cleared and
// body[data-sheet] snaps to collapsed (96px visible) / half (45vh) /
// full (85vh) by midpoint thresholds between the snap heights.
// mobile.css realises those heights with translateY as well, so no
// layout property is ever animated.
//
// Time float: the toggle is #time-float-toggle, or a [data-time-toggle]
// element, or (fallback) a button inside #time-float that already
// carries aria-expanded. State lives on #time-float[data-expanded]
// ("true"/"false"); mobile.css hides the second row only when the
// value is exactly "false". The second row is whichever of these the
// desktop markup provides (first match wins):
//   [data-time-row="second"], .time-float-row--second,
//   .time-float-second, or a second .time-float-row sibling.
// If none is found, toggling still records data-expanded (desktop CSS
// may use it) but hides nothing by guessing. If the toggle itself sits
// inside the second row, collapsing is skipped entirely: hiding the
// toggle would trap the controller closed.

(function () {
  "use strict";

  function init() {
    initDrawer();
    initSheet();
    initTimeFloat();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ---- Drawer -------------------------------------------------------
  function initDrawer() {
    var toggle = document.getElementById("nav-toggle");
    var scrim = document.getElementById("nav-scrim");
    var nav = document.getElementById("nav");
    if (!toggle && !scrim && !nav) return;

    function isOpen() {
      return document.body.hasAttribute("data-nav-open");
    }

    function open() {
      document.body.setAttribute("data-nav-open", "");
      if (toggle) toggle.setAttribute("aria-expanded", "true");
    }

    function close() {
      document.body.removeAttribute("data-nav-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }

    if (toggle) {
      toggle.addEventListener("click", function () {
        if (isOpen()) close();
        else open();
      });
    }

    if (scrim) {
      scrim.addEventListener("click", close);
    }

    // Tapping a destination shows the scene again instead of leaving
    // the drawer over it.
    if (nav) {
      nav.addEventListener("click", function (event) {
        var target = event.target;
        if (target && target.closest && target.closest("button, a")) {
          close();
        }
      });

      // Escape closes the drawer only (stopPropagation in capture so
      // the window keydown handler in main.js does not also trigger
      // "back to overview" on the same press). Focused form controls
      // keep their own Escape behaviour.
      document.addEventListener(
        "keydown",
        function (event) {
          if (event.key !== "Escape" || !isOpen()) return;
          var tag =
            event.target && event.target.tagName
              ? event.target.tagName
              : "";
          if (
            tag === "INPUT" ||
            tag === "BUTTON" ||
            tag === "SELECT" ||
            tag === "TEXTAREA"
          ) {
            return;
          }
          event.stopPropagation();
          close();
        },
        true
      );
    }
  }

  // ---- Bottom sheet drag --------------------------------------------
  function initSheet() {
    var handle = document.getElementById("sheet-handle");
    if (!handle) return;

    var sheet = null;
    if (handle.closest) {
      sheet = handle.closest("#info-sheet");
    }
    if (!sheet) sheet = document.getElementById("info-sheet");
    if (!sheet) sheet = document.getElementById("info");
    if (!sheet) return;

    var COLLAPSED_PX = 96;
    var HALF_VH = 0.45;
    var FULL_VH = 0.85;

    // The sheet's own height (85vh in mobile.css); fall back to 85vh
    // of the viewport if CSS has not applied yet.
    function sheetHeight() {
      var h = sheet.offsetHeight || 0;
      if (h > 0) return h;
      return Math.round(window.innerHeight * FULL_VH);
    }

    // translateY offset for a snap state (0 = fully visible).
    function offsetFor(state) {
      var h = sheetHeight();
      var vh = window.innerHeight;
      if (state === "full") return 0;
      if (state === "half") {
        return Math.max(0, h - Math.round(vh * HALF_VH));
      }
      return Math.max(0, h - COLLAPSED_PX);
    }

    function currentState() {
      return document.body.getAttribute("data-sheet") || "collapsed";
    }

    // Make the starting state explicit; mobile.css already renders
    // "no attribute" as collapsed, so this changes nothing visually.
    if (!document.body.getAttribute("data-sheet")) {
      document.body.setAttribute("data-sheet", "collapsed");
    }

    var dragging = false;
    var startY = 0;
    var startOffset = 0;
    var currentOffset = 0;

    handle.addEventListener("pointerdown", function (event) {
      if (dragging) return;
      dragging = true;
      startY = event.clientY;
      startOffset = offsetFor(currentState());
      currentOffset = startOffset;
      sheet.style.transition = "none";
      if (event.pointerId !== undefined && handle.setPointerCapture) {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (err) {
          // Pointer capture is best-effort; dragging still works
          // while the pointer stays over the handle.
        }
      }
    });

    handle.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var maxOffset = offsetFor("collapsed");
      currentOffset = Math.min(
        maxOffset,
        Math.max(0, startOffset + (event.clientY - startY))
      );
      sheet.style.transform = "translateY(" + currentOffset + "px)";
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      // Clearing the inline styles hands control back to mobile.css,
      // whose 260ms transform transition animates the snap.
      sheet.style.transform = "";
      sheet.style.transition = "";
      var vh = window.innerHeight;
      var visible = sheetHeight() - currentOffset;
      var halfPx = vh * HALF_VH;
      var fullPx = vh * FULL_VH;
      var midCollapsedHalf = (COLLAPSED_PX + halfPx) / 2;
      var midHalfFull = (halfPx + fullPx) / 2;
      var next =
        visible >= midHalfFull
          ? "full"
          : visible >= midCollapsedHalf
            ? "half"
            : "collapsed";
      document.body.setAttribute("data-sheet", next);
    }

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  // ---- Floating time controller --------------------------------------
  function initTimeFloat() {
    var floatEl = document.getElementById("time-float");
    if (!floatEl) return;

    var toggle = document.getElementById("time-float-toggle");
    if (!toggle && floatEl.querySelector) {
      toggle = floatEl.querySelector("[data-time-toggle]");
    }
    if (!toggle && floatEl.querySelectorAll) {
      var candidates = floatEl.querySelectorAll("button[aria-expanded]");
      if (candidates && candidates.length > 0) toggle = candidates[0];
    }
    // No toggle: leave every row visible. Hiding a row with no way to
    // reopen it would silently remove time controls.
    if (!toggle) return;

    var secondRow = null;
    if (floatEl.querySelector) {
      secondRow =
        floatEl.querySelector('[data-time-row="second"]') ||
        floatEl.querySelector(".time-float-row--second") ||
        floatEl.querySelector(".time-float-second") ||
        floatEl.querySelector(".time-float-row + .time-float-row");
    }
    // If the toggle lives inside the second row, collapsing would hide
    // the toggle itself: do not collapse, and do not wire a trap.
    if (secondRow && secondRow.contains && secondRow.contains(toggle)) {
      return;
    }

    function setExpanded(expanded) {
      floatEl.setAttribute("data-expanded", expanded ? "true" : "false");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    // Compact by default once a toggle exists; first row stays visible.
    setExpanded(false);

    toggle.addEventListener("click", function () {
      var expanded = floatEl.getAttribute("data-expanded") === "true";
      setExpanded(!expanded);
    });
  }
})();
