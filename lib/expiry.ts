export function expired(expires: Date, now = Date.now()) {
  return now >= expires.getTime();
}
