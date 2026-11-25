import { expired } from "@/lib/expiry";
import { notFound } from "next/navigation";
import { db, merchant } from "@/lib/db";
import { baht, localDate } from "@/lib/display";
import { Simulator } from "@/components/controls";
import QRCode from "qrcode";
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
        : expired(l.expires)
          ? "Link expired"
          : "";
  const methods = l.methods.split(",");
  const qr =
    !closed && methods.includes("QR")
      ? await QRCode.toDataURL("PAYPILOT-SANDBOX:" + l.id, {
          width: 220,
          margin: 4,
          errorCorrectionLevel: "M",
        })
      : null;
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
        <>
          <h2>{closed}</h2>
          <p>
            {closed === "Paid in full"
              ? "รายการนี้ชำระครบแล้ว"
              : "ลิงก์นี้ปิดแล้ว กรุณาขอลิงก์ปัจจุบันจากร้านค้า"}
          </p>
        </>
      ) : (
        <>
          {qr && (
            <figure className="sandbox-qr">
              <img src={qr} width={220} height={220} alt="QR จำลองสำหรับเดโม" />
              <figcaption>QR จำลองสำหรับเดโม ชำระเงินจริงไม่ได้</figcaption>
            </figure>
          )}
          <p>เลือกวิธีชำระและผลที่ต้องการทดสอบ แล้วกด Simulate checkout</p>
          <Simulator linkId={l.id} methods={methods} />
        </>
      )}
    </section>
  );
}
