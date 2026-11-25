"use client";
export default function CheckoutError({ reset }: { reset: () => void }) {
  return (
    <section className="panel checkout">
      <h1>เปิดหน้าชำระเงินไม่ได้ชั่วคราว</h1>
      <p>กรุณาลองโหลดลิงก์อีกครั้ง หากยังเปิดไม่ได้ ให้ติดต่อร้านค้าเพื่อตรวจสอบลิงก์</p>
      <button className="button" onClick={reset}>
        ลองอีกครั้ง
      </button>{" "}
      <button className="button" onClick={() => window.location.reload()}>
        โหลดหน้าใหม่
      </button>
    </section>
  );
}
