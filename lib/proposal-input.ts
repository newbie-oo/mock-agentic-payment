import { z } from "zod";

export const method = z.enum(["QR", "CARD"]);
export const recordId = z.string().min(1).max(100);
export const createInput = z
  .object({
    amount: z
      .number()
      .int()
      .min(1)
      .max(2147483647)
      .describe("THB satang, 100 per baht"),
    currency: z.literal("THB").default("THB"),
    customer: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(250),
    methods: z.array(method).min(1).max(2).default(["QR"]),
    expires: z.iso.datetime().optional(),
  })
  .strict();
