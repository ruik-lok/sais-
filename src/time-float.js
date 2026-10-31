// ORBITAL mobile floating time controller — coordinator integration.
// On narrow viewports (<=900px) this MOVES (not copies) the existing
// footer time controls into #time-float, so there are never duplicate
// ids and main.js wiring (attached later by the module script) works
// unchanged: moved nodes keep their identity and listeners.
// Row 1: play group + overview + date/speed labels. Row 2 (collapsible
// via mobile.js): speed group + date group. The events panel moves into
// the float as a third, always-visible row, because mobile.css hides
// the whole footer once #time-float carries controls — leaving #events
// in the footer would hide it on mobile.
// On desktop width everything moves back to the footer in original
// order (inserted before #events' original position, i.e. footer end).
// If any hook is missing, this file does nothing and the footer stays
// fully functional (mobile.css keeps it visible when #time-float is
// empty of controls).
(function () {
  "use strict";
  function init() {
    var floatEl = document.getElementById("time-float");
    var footer = document.querySelector("#app footer");
    if (!floatEl || !footer) return;
    var events = document.getElementById("events");
    var groups = Array.prototype.slice.call(footer.querySelectorAll(".time-group"));
    var playGroup = groups[0] || null;
    var speedGroup = groups[1] || null;
    var dateGroup = groups[2] || null;
    var simDate = document.getElementById("sim-date");
    var simSpeed = document.getElementById("sim-speed");
    var overviewBtn = document.getElementById("overview-btn");
    if (!playGroup && !speedGroup && !dateGroup) return;

    var row1 = document.createElement("div");
    row1.className = "time-float-row";
    var row2 = document.createElement("div");
    row2.className = "time-float-row";
    row2.setAttribute("data-time-row", "second");
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "time-float-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "时间控制";
    var moved = false;

    function moveToFloat() {
      if (moved) return;
      floatEl.appendChild(toggle);
      floatEl.appendChild(row1);
      floatEl.appendChild(row2);
      if (playGroup) row1.appendChild(playGroup);
      if (overviewBtn) row1.appendChild(overviewBtn);
      if (simDate) row1.appendChild(simDate);
      if (simSpeed) row1.appendChild(simSpeed);
      if (speedGroup) row2.appendChild(speedGroup);
      if (dateGroup) row2.appendChild(dateGroup);
      if (events) {
        // Phase 2 P2-30 (UI-12): events get their OWN vertical class,
        // not the flex row class. Reusing time-float-row made #events
        // a flex container, so multi-event days flowed sideways; it
        // also (as a .time-float-row sibling) hid events entirely when
        // the second row collapsed. .time-float-events is a vertical
        // flex column in mobile.css and is never collapsed.
        events.classList.add("time-float-events");
        floatEl.appendChild(events);
      }
      moved = true;
    }
    function moveToFooter() {
      if (!moved) return;
      var order = [playGroup, speedGroup, dateGroup, simDate, simSpeed, overviewBtn];
      order.forEach(function (n) { if (n) footer.appendChild(n); });
      if (events) {
        events.classList.remove("time-float-events");
        events.classList.remove("time-float-row"); // pre-P2-30 leftover, if any
        footer.appendChild(events);
      }
      if (toggle.parentNode) toggle.parentNode.removeChild(toggle);
      if (row1.parentNode) row1.parentNode.removeChild(row1);
      if (row2.parentNode) row2.parentNode.removeChild(row2);
      moved = false;
    }
    function apply() {
      if (window.matchMedia("(max-width: 900px)").matches) moveToFloat();
      else moveToFooter();
    }
    apply();
    var mq = window.matchMedia("(max-width: 900px)");
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
