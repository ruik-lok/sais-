// time.js — simulation clock. The simulated date drives positions via astro.js.
// The clock stores a UTC JS Date; astro.jdFromDate converts it to TT.
// (TT-UTC is ~69 s in 2026 — see astro.js deltaTSeconds — so the clock
// date and the TT Julian Day differ by that offset, by design.)

export class SimClock {
  constructor() {
    this.date = new Date(); // UTC, real "now" at start
    this.playing = true;
    this.reverse = false;
    this.daysPerSecond = 1; // default: 1 simulated day per real second
    this.lastReal = performance.now();
  }
  /**
   * Set the simulated date. Guard (INTERFACE_CONTRACTS §3): an Invalid
   * Date (or a non-Date) NEVER throws and NEVER produces NaN — the
   * previous valid date is kept and false is returned. A valid date
   * returns true. The time of day is preserved as given; callers must
   * not truncate it to T00:00:00Z (main.js already passes full dates).
   */
  setDate(date) {
    let ms;
    try { ms = date.getTime(); } catch { return false; }
    if (!Number.isFinite(ms)) return false;
    this.date = new Date(ms);
    return true;
  }
  /**
   * Return to "now" and restore FORWARD playback (playing=true,
   * reverse=false), per INTERFACE_CONTRACTS §3 ("回到现在" must resume
   * forward play unless the user changes it afterwards).
   */
  now() {
    this.date = new Date();
    this.playing = true;
    this.reverse = false;
    return true;
  }
  step() {
    const now = performance.now();
    const dt = Math.min((now - this.lastReal) / 1000, 0.25);
    this.lastReal = now;
    if (this.playing) {
      const dir = this.reverse ? -1 : 1;
      this.date = new Date(this.date.getTime() + dir * this.daysPerSecond * dt * 86400000);
    }
    return dt;
  }
  speedUp() { this.daysPerSecond = Math.min(this.daysPerSecond * 10, 10000); }
  speedDown() { this.daysPerSecond = Math.max(this.daysPerSecond / 10, 0.01); }
  /**
   * Human label. Years outside 0001-9999 are NOT truncated by slicing
   * an ISO string (which garbles "+010000-..." forms): the year is
   * printed in full when it does not fit four digits.
   */
  label() {
    const d = this.date;
    const y = d.getUTCFullYear();
    const ys = (y >= 1 && y <= 9999) ? String(y).padStart(4, "0") : String(y);
    const p2 = (n) => String(n).padStart(2, "0");
    return `${ys}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`;
  }
  /**
   * Value for an <input type="date"> refill. HTML date inputs only
   * accept years 0001-9999; outside that range "" is returned rather
   * than a garbled string (the caller keeps the previous input value).
   */
  dateInputValue() {
    const y = this.date.getUTCFullYear();
    if (y < 1 || y > 9999) return "";
    const p2 = (n) => String(n).padStart(2, "0");
    return `${String(y).padStart(4, "0")}-${p2(this.date.getUTCMonth() + 1)}-${p2(this.date.getUTCDate())}`;
  }
}
