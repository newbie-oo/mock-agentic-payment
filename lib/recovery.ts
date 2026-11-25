import { expired } from "./expiry";
type Attempt = { createdAt: Date; status: string; method: string };
export function recovery(
  order: { createdAt: Date; status: string },
  link: { activeSlot: string | null; expires: Date } | undefined,
  attempt?: Attempt,
) {
  if (order.status !== "OPEN" || !link?.activeSlot) return "SKIP";
  if (expired(link.expires)) return "REPLACE";
  if (attempt?.status === "FAILED" && attempt.method === "CARD")
    return "CHECK_METHODS";
  if (attempt?.status === "UNKNOWN") return "VERIFY";
  return Date.now() - +(attempt?.createdAt ?? order.createdAt) >= 86400000
    ? "REMIND"
    : "WAIT";
}
