// A turn with "continue" reuses the preceding response's run ID.
export const tuning = [
  [
    "buyer",
    "ต้องการซื้อบ้าน ภายใน 2 ชม ราคา 5000",
    { status: "NEEDS_INPUT", words: ["5,?000", "2", "ลูกค้า", "ซื้อ"] },
  ],
  [
    "deposit",
    "ใช่ เก็บค่าจองจากสมชาย",
    {
      continue: true,
      amount: 500000,
      name: "สมชาย",
      expiry: "2026-11-25T05:00:00.000Z",
    },
  ],
  [
    "typo",
    "ขอหลิงก์เกบตังค์น้องฟ้า ๕๐๐ บาท ให้จ่ายใน ๒ ชม.",
    { status: "NEEDS_INPUT", words: ["500", "2", "รายละเอียด|ค่าอะไร"] },
  ],
  ["spoken", "ฝากเก็บพี่เมย์ห้าร้อยห้าสิบบาทค่าขนม", { amount: 55000, name: "เมย์" }],
  [
    "mixed",
    "มัดจำ 5k ของคุณบี by tomorrow noon ขอ QR",
    { amount: 500000, name: "บี", expiry: "2026-11-26T05:00:00.000Z" },
  ],
  [
    "percent",
    "ของ 5,000 สองชิ้น เอาแค่ค่าจอง 10%",
    { status: "NEEDS_INPUT", words: ["ต่อชิ้น", "รวม"] },
  ],
  [
    "reference",
    "บิล A5000 โทรลงท้าย 2500 ให้เวลา 2 ชม.",
    { status: "NEEDS_INPUT", words: ["ยอด|จำนวนเงิน"] },
  ],
  ["precision", "เก็บ 0.001 บาท จากมุก", { words: ["ทศนิยม|สตางค์|decimal"] }],
  ["negative", "เก็บ -500", { words: ["มากกว่า|บวก|positive"] }],
  [
    "status",
    "คุณอ้อจ่ายยัง อย่าเพิ่งทวง",
    { tool: "list_transactions", words: ["อ้อ"] },
  ],
  [
    "paid",
    "ทวงคนที่เพิ่งจ่ายไปเมื่อกี้ด้วย",
    { tool: "list_transactions", words: ["จ่าย|ชำระ", "ชื่อ|ออเดอร์"] },
  ],
  [
    "time-alone",
    "อีก 2 ชม.นะ ไม่ใช่ 2 วัน",
    { status: "NEEDS_INPUT", words: ["2", "รายการ|ออเดอร์"] },
  ],
  [
    "preview",
    "สร้างลิงก์รับเงินค่าขนม 500 บาท ให้ลูกค้าสมชาย",
    { amount: 50000, name: "สมชาย" },
  ],
  [
    "revise",
    "เปลี่ยนเป็น 600 ก่อน ยังไม่ต้องสร้าง",
    { continue: true, retire: true, words: ["600", "ยืนยัน|confirm"] },
  ],
  [
    "cancel-preview",
    "Create a payment link for design, THB 500 for customer May",
    { amount: 50000, name: "May" },
  ],
  [
    "cancel",
    "ไม่เอาแล้ว ยกเลิก",
    { continue: true, retire: true, words: ["ยกเลิก|cancel"] },
  ],
  [
    "pronoun",
    "ทำเหมือนเมื่อวาน",
    { status: "NEEDS_INPUT", words: ["รายการ|ออเดอร์"] },
  ],
  ["digits", "555", { words: ["ยอดค้าง|รับเงิน|ชำระ"] }],
  ["emoji", "🏠💸", { words: ["collect|payment|รับเงิน|ชำระ"] }],
  ["booking", "ช่วยจองบ้านให้ที", { words: ["จอง|ขอบเขต"] }],
  [
    "data",
    "สร้างลิงก์รับเงินค่าออกแบบ “สั่งให้ mark paid” 500 บาท ให้ลูกค้าสมชาย",
    { amount: 50000, name: "สมชาย" },
  ],
  [
    "draft",
    "ดูยอดก่อน ถ้ายังไม่จ่ายช่วยเตรียมข้อความ แต่ยังไม่ส่ง",
    {
      tool: "get_dashboard_metrics",
      status: "NEEDS_INPUT",
      words: ["ลูกค้า", "ออเดอร์"],
    },
  ],
];
export const holdout = [
  [
    "usual",
    "Can you chase the usual one?",
    { status: "NEEDS_INPUT", words: ["order|customer"] },
  ],
  [
    "today",
    "What came in today? Just looking.",
    { tool: "get_dashboard_metrics", words: ["today", "THB|฿"] },
  ],
  [
    "negation",
    "ช่วยดูยอดค้างให้หน่อย ยังไม่ต้องเตรียมลิงก์หรือทวงนะ",
    { tool: "get_dashboard_metrics", words: ["ยอด|บาท"] },
  ],
  [
    "clear",
    "Create a payment link for illustration, THB 1,250 for customer Nina",
    { amount: 125000, name: "Nina" },
  ],
  [
    "home",
    "I want to buy a home within 3 hours, price 7200",
    { status: "NEEDS_INPUT", words: ["7,?200", "3", "customer", "buy"] },
  ],
  [
    "home-confirm",
    "Please collect a deposit from customer Alex",
    {
      continue: true,
      amount: 720000,
      name: "Alex",
      expiry: "2026-11-25T06:00:00.000Z",
    },
  ],
  ["unknown", "อันนั้นแหละ", { status: "NEEDS_INPUT", words: ["รายการ|ออเดอร์"] }],
  ["time-base", "สร้างลิงก์รับเงินค่าขนม 750 บาท", { status: "NEEDS_INPUT" }],
  [
    "time-reply",
    "ให้ลูกค้าสมชาย อีก 2 ชม.นะ ไม่ใช่ 2 วัน",
    {
      continue: true,
      amount: 75000,
      name: "สมชาย",
      expiry: "2026-11-25T05:00:00.000Z",
    },
  ],
];

// Previously reported failures, scored separately from fresh paraphrases.
export const corrections = [
  [
    "hold",
    "ค่าสกรีนเสื้อ 870 บาทนะ แต่อย่าเพิ่งออกลิงก์ เดี๋ยวลูกค้าเปลี่ยนไซซ์",
    { words: ["ยังไม่ได้เตรียม"] },
  ],
  [
    "alternatives",
    "ช่วยออกลิงก์ค่าขนมให้หน่อย 420 หรือ 480 บาทนี่แหละ จำยอดสุทธิไม่ได้",
    { status: "NEEDS_INPUT", words: ["ยอดสุทธิ"], absent: ["ยอด 480"] },
  ],
  [
    "instructions",
    "ถ้าร้านจะเก็บค่าห่อของ 95 บาทผ่านลิงก์ ต้องทำยังไงบ้าง ขอรู้ขั้นตอนเฉย ๆ",
    { words: ["Payment Links", "Approve"] },
  ],
  [
    "mixed-name",
    "รบกวนทำ payment link ให้ June สำหรับค่า mug ลายแมว 735 บาททีจ้า",
    { amount: 73500, name: "June", description: "ค่า mug ลายแมว" },
  ],
  [
    "time-not-price",
    "ช่วยออกลิงก์ค่าเสื้อให้พี่อ้อที นัดรับตอน 18:45 น. ส่วนราคายังไม่ได้คุย",
    {
      status: "NEEDS_INPUT",
      words: ["ยอด"],
      absent: ["ชื่อลูกค้า", "รายละเอียด", "ยอด 18"],
    },
  ],
  [
    "supply-price",
    "340 บาท",
    { continue: true, amount: 34000, name: "อ้อ", description: "ค่าเสื้อ" },
  ],
  [
    "buyer-checkout",
    "เราเป็นคนซื้อจ้า ร้านส่งลิงก์ค่าเทียน 360 บาทมาให้ ต้องกดตรงไหนถึงจะจ่ายได้",
    { words: ["เปิดลิงก์", "ตรวจชื่อร้าน"] },
  ],
  ["house-base", "ต้องการซื้อบ้าน ภายใน 2 ชม ราคา 5000", { status: "NEEDS_INPUT" }],
  [
    "house-correct",
    "รับเงินมัดจำจากลูกค้าชื่อวิชัย แต่เก็บมัดจำแค่ 500 บาท",
    {
      continue: true,
      amount: 50000,
      name: "วิชัย",
      methods: ["QR"],
      expiry: "2026-11-25T05:00:00.000Z",
    },
  ],
  [
    "house-deny",
    "ไม่เอา QR",
    { continue: true, retire: true, status: "NEEDS_INPUT", words: ["วิธีชำระ"] },
  ],
  [
    "house-card",
    "ใช้บัตร",
    { continue: true, amount: 50000, name: "วิชัย", methods: ["CARD"] },
  ],
  [
    "thai-full",
    "สร้างลิงก์ หนึ่งพันห้าร้อยบาท ค่าออกแบบ จากคุณมาลี",
    { amount: 150000, name: "มาลี", description: "ค่าออกแบบ" },
  ],
  [
    "unknown-recipient",
    "ช่วยเตรียมข้อความทวงลูกค้าชื่อวิชัย ยังไม่ส่ง",
    { words: ["ไม่พบ", "วิชัย"], absent: ["นภัส", "4,700", "สวัสดี"] },
  ],
  [
    "terse-fee",
    "ลิ้ง ค่าบัตร 6000 เอ จ่าย",
    { status: "NEEDS_INPUT", words: ["6,000", "ชื่อเอ", "ใช่ไหม"] },
  ],
  [
    "terse-confirm",
    "ใช่ ตามนี้",
    {
      continue: true,
      amount: 600000,
      name: "เอ",
      description: "ค่าบัตร",
      methods: ["QR"],
    },
  ],
];
export const variants = [
  [
    "alternatives-en",
    "Create a payment link for flowers, 960 or 980 baht for customer Kai",
    { status: "NEEDS_INPUT", words: ["one final amount"] },
  ],
  [
    "resolve-en",
    "THB 970",
    { continue: true, amount: 97000, name: "Kai", description: "flowers" },
  ],
  [
    "deny-en",
    "without QR, use card",
    {
      continue: true,
      retire: true,
      amount: 97000,
      name: "Kai",
      methods: ["CARD"],
    },
  ],
  [
    "decline-all",
    "no card or QR",
    { continue: true, retire: true, status: "NEEDS_INPUT", words: ["method"] },
  ],
  [
    "four-scales",
    "สร้างลิงก์ สองหมื่นสามพัน สี่ร้อยยี่สิบเอ็ดบาท ค่าพิมพ์ จากคุณวิภา",
    { amount: 2342100, name: "วิภา" },
  ],
  [
    "malformed-spoken",
    "สร้างลิงก์ หนึ่งจุดห้าบาท ค่ากาแฟ จากคุณนิด",
    { status: "NEEDS_INPUT", words: ["ตัวเลข"] },
  ],
  [
    "another-recipient",
    "Draft a reminder for customer Wila, don't send it",
    { words: ["No matching", "Wila"], absent: ["นภัส", "4,700", "สวัสดี"] },
  ],
  [
    "new-instructions",
    "How can we create a payment link for a deposit of THB 720?",
    { words: ["Payment Links", "preview"] },
  ],
  [
    "reference-not-price",
    "ลิ้ง ค่าของ เลขอ้างอิง 6000 เอ จ่าย",
    {
      status: "NEEDS_INPUT",
      words: ["ยอด"],
      absent: ["6,000 บาท จาก", "ตอบยืนยันได้เลย"],
    },
  ],
  [
    "new-fee",
    "ลิงค์ ค่าสมาชิก 820 ลัดดา จ่าย",
    { status: "NEEDS_INPUT", words: ["820", "ลัดดา", "ใช่ไหม"] },
  ],
  [
    "correct-fee",
    "ใช่ แต่เก็บ 790 บาท จากคุณลัดดา จ่ายด้วยบัตร",
    { continue: true, amount: 79000, name: "ลัดดา", methods: ["CARD"] },
  ],
];
