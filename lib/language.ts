export const isThai = (text: string) => /[ก-๙]/.test(text);
export function normalize(text: string) {
  return text
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - "๐".charCodeAt(0)))
    .replace(/หลิงก์|ลิ้ง(?:ค์|ก์)?|ลิงค์|ลิงก(?!์)|ลิงค(?!์)/g, "ลิงก์")
    .replaceAll("เกบตังค์", "เก็บเงิน");
}
export function scopeReply(prompt: string, context = prompt) {
  const thai = isThai(prompt);
  if (
    /(?:อย่าเพิ่ง|ยังไม่ต้อง|ไม่ต้อง|ห้าม)\s*(?:สร้าง|ออก|ทำ|เปิด)(?:ลิงก์)?|hold (?:off|on)|(?:do not|don't|don’t) (?:create|make|generate|issue)/i.test(
      prompt,
    )
  )
    return thai
      ? "ยังไม่ได้เตรียมข้อเสนอใหม่ หากต้องการดำเนินการ กรุณาระบุรายการอีกครั้ง"
      : "Creation is on hold. Specify the payment when you are ready.";
  if (
    /ซื้อเอง|เป็นผู้ซื้อ|ซื้อบ้านเอง|I am (?:the |a )?buyer|buy(?:ing)? (?:it )?(?:myself|for myself)|(?:เป็น|ฝั่ง)(?:คน|ผู้)ซื้อ|ร้าน(?:ค้า)?ส่งลิงก์|(?:the )?(?:seller|store|shop) sent (?:me )?a link|how (?:can|do) I pay/i.test(
      prompt,
    )
  )
    return thai
      ? "หากได้รับลิงก์จากร้านค้า ให้เปิดลิงก์ ตรวจชื่อร้านและยอด แล้วเลือกวิธีชำระ ใน PayPilot ปุ่ม Simulate checkout ใช้จำลองเท่านั้น"
      : (/house|home/i.test(context)
          ? "Buying a home is outside the merchant workspace. "
          : "") +
          "Open the checkout link, check the merchant and amount, then choose a payment method. PayPilot checkout is a simulator.";
  if (
    /ขั้นตอน|ทำ(?:ยังไง|อย่างไร)|วิธี(?:สร้าง|ออก|ทำ)|how (?:do|can|would) (?:I|we)|instructions only|just (?:explain|instructions)/i.test(
      prompt,
    )
  )
    return thai
      ? "วิธีสร้างลิงก์: เปิด Payment Links เลือก Create payment link ระบุชื่อลูกค้า รายละเอียด ยอดเงิน และวิธีชำระ จากนั้นตรวจ preview ก่อนกด Approve"
      : "In Payment Links choose Create payment link, enter the customer, description, amount and methods, then review the preview before approving.";
  if (/(?:คิด|ค่าจอง|deposit|มัดจำ).*\d+\s*%/i.test(prompt))
    return (
      "NEED_INPUT " +
      (thai
        ? "ราคาที่ระบุเป็นราคาต่อชิ้นหรือยอดรวมทุกชิ้น? กรุณายืนยันฐานคำนวณค่าจอง"
        : "Is the quoted price per item or the total? Please confirm the deposit basis.")
    );
  if (
    /(?:เก็บ|collect|ยอด|บาท|THB)[^\n]{0,30}-\s*\d|\d+\.\d{3,}\s*(?:บาท|THB|baht)/i.test(
      prompt,
    )
  )
    return thai
      ? "กรุณาใช้ยอดบวกมากกว่าศูนย์ และระบุทศนิยมได้ไม่เกินสองตำแหน่ง"
      : "Enter a positive THB amount with at most two decimal places.";
  if (/^(?:บิล|invoice)\s*[A-Z]\d/i.test(prompt))
    return (
      "NEED_INPUT " +
      (thai
        ? "เลขบิลและเบอร์โทรไม่ระบุยอดที่ต้องการรับ กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด"
        : "Please provide the payment amount, customer and description.")
    );
  if (
    /ทำเหมือน|อันนั้น|ตามเดิม|the usual|same as (?:before|yesterday)/i.test(prompt)
  )
    return (
      "NEED_INPUT " +
      (thai
        ? "หมายถึงรายการใด? กรุณาระบุชื่อออเดอร์หรือลูกค้า"
        : "Which order or customer do you mean?")
    );
  if (/^(?:อีก|ภายใน|in|within)\s*\d/i.test(prompt))
    return (
      "NEED_INPUT " +
      (thai
        ? "ต้องการใช้เวลา " +
          (prompt.match(/\d+/)?.[0] ?? "") +
          " ชั่วโมงกับรายการใด? กรุณาระบุออเดอร์"
        : "Which order should this deadline apply to?")
    );
  if (/จองบ้านให้|book (?:a|the) house/i.test(prompt))
    return thai
      ? "การจองบ้านอยู่นอกขอบเขตของ PayPilot หากต้องการรับค่าจองจากลูกค้า กรุณาระบุยอดและชื่อ"
      : "PayPilot can collect a reservation payment. Property booking is outside its scope.";
}
export function readIntent(prompt: string) {
  if (/(?:เตรียม|ร่าง)(?:ข้อความ|คำทวง)|draft.*remind/i.test(prompt))
    return "draft";
  if (/จ่ายยัง|จ่ายหรือยัง|เพิ่งจ่าย|just paid|already paid/i.test(prompt))
    return "status";
  if (
    /ดูยอด|ดูรายรับ|just looking|what came in|read.only|อย่าเพิ่งทวง|ยังไม่ต้อง.*(?:ทวง|ลิงก์)/i.test(
      prompt,
    )
  )
    return "metrics";
}
