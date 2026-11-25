// Installed only in isolated evaluation processes.
const clock = Date.parse("2026-11-25T03:00:00Z");
global.Date = new Proxy(Date, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : [clock]);
  },
  apply(target) {
    return new target(clock).toString();
  },
  get(target, key) {
    return key === "now" ? () => clock : Reflect.get(target, key);
  },
});
