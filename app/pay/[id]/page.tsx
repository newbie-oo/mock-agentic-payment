import { notFound } from "next/navigation";
import { db, merchant } from "@/lib/db";
import { baht, localDate } from "@/lib/display";
import { Simulator } from "@/components/controls";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const l = await db.link.findFirst({
    where: { id: (await params).id, order: { merchant } },
    include: { order: true },
  });
  if (!l) notFound();
  const closed =
    l.order.status === "PAID"
      ? "Paid in full"
      : !l.activeSlot
        ? "Link replaced"
        : +l.expires <= Date.now()
          ? "Link expired"
          : "";
  return (
    <section className="panel checkout">
      <span className="badge">Sandbox checkout</span>
      <h1>{baht(l.order.amount)}</h1>
      <h2>{l.order.description}</h2>
      <p>Studio Bangkok · {l.order.customer}</p>
      <small>Expires {localDate(l.expires)} Bangkok</small>
      <hr />
      <p>This simulation records a demo payment. No money moves.</p>
      {closed ? (
        <h2>{closed}</h2>
      ) : (
        <Simulator linkId={l.id} methods={l.methods.split(",")} />
      )}
    </section>
  );
}
