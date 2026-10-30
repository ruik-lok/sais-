// time.js — simulation clock. The simulated date drives positions via astro.js.
export class SimClock {
  constructor() {
    this.date = new Date(); // UTC, real "now" at start
    this.playing = true;
    this.reverse = false;
    this.daysPerSecond = 1; // default: 1 simulated day per real second
    this.lastReal = performance.now();
  }
  setDate(date) { this.date = new Date(date.getTime()); }
  now() { this.date = new Date(); }
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
  label() {
    return this.date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  }
  dateInputValue() {
    return this.date.toISOString().slice(0, 10);
  }
}
