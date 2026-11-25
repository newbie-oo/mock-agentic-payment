import { expired } from "./expiry";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, merchant, day } from "./db";

export const method = z.enum(["QR", "CARD"]);
const id = z.string().min(1).max(100);
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
export const replaceInput = z.object({ linkId: id }).strict();
export const noticeInput = z
  .object({ linkId: id, body: z.string().trim().min(1).max(1000) })
  .strict();
export const pageInput = z
  .object({ page: z.number().int().min(1).max(100000).default(1) })
  .strict();
export const linkInput = z.object({ linkId: id }).strict();
export const orderInput = z.object({ orderId: id }).strict();
export const txInput = z.object({ transactionId: id }).strict();
export const scope = merchant;
export const size = 12;
type Tx = Prisma.TransactionClient;
const latest = {
  links: { orderBy: { createdAt: "desc" }, take: 1 },
  attempts: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
} satisfies Prisma.OrderInclude;
export const cursorInput = z
  .object({ id, createdAt: z.iso.datetime() })
  .strict();
export type OrderCursor = z.infer<typeof cursorInput>;
export function orders(
  page = 1,
  unpaid = false,
  m = scope,
  take = size,
  before?: OrderCursor,
  recipient?: { customer?: string; orderId?: string },
) {
  return db.order.findMany({
    where: {
      merchant: m,
      customer: recipient?.customer,
      id: recipient?.orderId,
      ...(unpaid ? { status: "OPEN" } : {}),
      ...(before
        ? {
            OR: [
              { createdAt: { lt: new Date(before.createdAt) } },
              { createdAt: new Date(before.createdAt), id: { lt: before.id } },
            ],
          }
        : {}),
    },
    include: latest,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * size,
    take,
  });
}
export function transactions(
  page = 1,
  m = scope,
  customer?: string,
  take = size,
) {
  return db.attempt.findMany({
    where: { merchant: m, ...(customer ? { order: { customer } } : {}) },
    include: { order: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * size,
    take,
  });
}
export function getLink(linkId: string, m = scope, client: Tx = db) {
  return client.link.findFirstOrThrow({
    where: { id: linkId, order: { merchant: m } },
    include: { order: true },
  });
}
export async function metrics(m = scope) {
  const [settled, open, customers, attempts, methods, trend] =
    await Promise.all([
      db.order.aggregate({
        where: { merchant: m, status: "PAID" },
        _sum: { amount: true },
        _count: true,
      }),
      db.order.aggregate({
        where: { merchant: m, status: "OPEN" },
        _sum: { amount: true },
        _count: true,
      }),
      db.$queryRaw<
        { n: bigint }[]
      >`SELECT COUNT(DISTINCT customer) AS n FROM "Order" WHERE merchant=${m} AND status='OPEN'`,
      db.attempt.groupBy({
        by: ["status"],
        where: { merchant: m },
        _count: true,
      }),
      db.attempt.groupBy({
        by: ["method"],
        where: { merchant: m, status: "SUCCESS" },
        _count: true,
      }),
      db.$queryRaw<
        { date: string; total: bigint }[]
      >`SELECT date(a.createdAt/1000,'unixepoch','+7 hours') AS date,SUM(o.amount) AS total FROM Attempt a JOIN "Order" o ON o.id=a.orderId WHERE a.merchant=${m} AND a.status='SUCCESS' AND a.createdAt>=${new Date(Date.now() - 14 * day)} GROUP BY date ORDER BY date`,
    ]);
  const counts = Object.fromEntries(attempts.map((a) => [a.status, a._count]));
  const denominator = attempts.reduce((n, a) => n + a._count, 0);
  return {
    revenue: settled._sum.amount ?? 0,
    success: settled._count,
    pending: open._sum.amount ?? 0,
    open: open._count,
    customers: Number(customers[0].n),
    failed: counts.FAILED ?? 0,
    denominator,
    rate: denominator ? (100 * settled._count) / denominator : 0,
    methods,
    trend: trend.map((p) => ({ ...p, total: Number(p.total) })),
  };
}
export function runRecord(
  prompt: string,
  mode: string,
  m = scope,
  client: Tx = db,
) {
  return client.agentRun.create({
    data: {
      merchant: m,
      prompt,
      mode,
      responseStatus: mode === "Manual" ? "COMPLETE" : "PROCESSING",
      createdAt: new Date(Date.now()),
    },
  });
}
export async function event(
  runId: string,
  kind: string,
  summary: string,
  client: Tx = db,
) {
  await client.agentAction.create({
    data: {
      runId,
      kind,
      status: "EVENT",
      payload: JSON.stringify({ summary }),
    },
  });
}
export async function propose(
  runId: string,
  kind: string,
  args: unknown,
  m = scope,
) {
  await db.agentRun.findFirstOrThrow({ where: { id: runId, merchant: m } });
  let payload;
  if (kind === "create_payment_link") {
    const data = createInput.parse(args);
    const expires = data.expires ?? new Date(Date.now() + day).toISOString();
    if (Date.parse(expires) <= Date.now())
      throw Error("Expiry must be in the future");
    payload = { ...data, expires };
  } else {
    if (!["regenerate_payment_link", "save_notification"].includes(kind))
      throw Error("Unknown proposal");
    const data =
      kind === "regenerate_payment_link"
        ? replaceInput.parse(args)
        : noticeInput.parse(args);
    const link = await db.link.findFirstOrThrow({
      where: { id: data.linkId, order: { merchant: m } },
      include: { order: { include: { attempts: latest.attempts } } },
    });
    const attempt = link.order.attempts[0];
    const activityAt = attempt?.createdAt ?? link.order.createdAt;
    if (!link.activeSlot || link.order.status !== "OPEN")
      throw Error("Order is no longer eligible");
    payload = {
      ...data,
      orderId: link.orderId,
      customer: link.order.customer,
      description: link.order.description,
      evidence: {
        reason:
          kind === "save_notification"
            ? Date.now() - +activityAt >= day
              ? "No new activity for at least 24 hours"
              : "Merchant reminder request"
            : expired(link.expires)
              ? "Current checkout expired"
              : "Replace current checkout",
        expires: link.expires,
        activityAt,
        attemptId: attempt?.id ?? null,
        outcome: attempt?.status ?? null,
        method: attempt?.method ?? null,
      },
      amount: link.order.amount,
      ...(kind === "regenerate_payment_link"
        ? {
            currency: link.order.currency,
            methods: link.methods.split(","),
            expires: new Date(Date.now() + day).toISOString(),
          }
        : {}),
    };
  }
  return db.agentAction.create({
    data: { runId, kind, payload: JSON.stringify(payload), status: "PROPOSED" },
  });
}
export async function decide(actionId: string, approve: boolean, m = scope) {
  return db.$transaction(async (tx) => {
    const action = await tx.agentAction.findFirstOrThrow({
      where: { id: actionId, run: { merchant: m } },
    });
    if (action.status !== "PROPOSED") return action;
    const finish = (status: string, result: object) =>
      tx.agentAction.update({
        where: { id: actionId },
        data: { status, result: JSON.stringify(result) },
      });
    await event(
      action.runId,
      approve ? "Approval" : "Rejection",
      action.kind,
      tx,
    );
    if (!approve)
      return finish("REJECTED", { summary: "Rejected by merchant" });
    const p = JSON.parse(action.payload);
    let result;
    if (action.kind === "create_payment_link") {
      const data = createInput.parse(p);
      const expires = new Date(data.expires!);
      if (expired(expires))
        return finish("STALE", { summary: "Proposal expired" });
      const { amount, currency, customer, description } = data;
      const order = await tx.order.create({
        data: { merchant: m, amount, currency, customer, description },
      });
      const link = await tx.link.create({
        data: {
          orderId: order.id,
          activeSlot: order.id,
          methods: data.methods.join(","),
          expires,
        },
      });
      result = await getLink(link.id, m, tx);
    } else {
      const link = await getLink(p.linkId, m, tx);
      if (!link.activeSlot || link.order.status !== "OPEN")
        return finish("STALE", { summary: "Order paid or link superseded" });
      if (action.kind === "regenerate_payment_link") {
        const expires = new Date(
          p.expires ?? new Date(+action.createdAt + day),
        );
        if (expired(expires))
          return finish("STALE", { summary: "Replacement proposal expired" });
        await tx.link.update({
          where: { id: link.id },
          data: { activeSlot: null },
        });
        const replacement = await tx.link.create({
          data: {
            orderId: link.orderId,
            activeSlot: link.orderId,
            methods: link.methods,
            expires,
          },
        });
        result = await getLink(replacement.id, m, tx);
      } else if (action.kind === "save_notification") {
        if (expired(link.expires))
          return finish("STALE", {
            summary: "Checkout expired before reminder approval",
          });
        if (p.evidence) {
          const last = await tx.attempt.findFirst({
            where: { merchant: m, orderId: link.orderId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
          });
          if ((last?.id ?? null) !== p.evidence.attemptId)
            return finish("STALE", {
              summary:
                "Payment activity changed after the reminder was drafted",
            });
        }
        await tx.notification.create({
          data: {
            merchant: m,
            actionId,
            orderId: link.orderId,
            body: noticeInput.shape.body.parse(p.body),
          },
        });
        result = await tx.notification.findUniqueOrThrow({
          where: { actionId },
        });
      } else throw Error("Unknown action");
    }
    await event(action.runId, "Executed", action.kind, tx);
    await event(action.runId, "Verified", result.id, tx);
    return finish("EXECUTED", result);
  });
}
export const simulation = z
  .object({
    linkId: id,
    requestId: z.uuid(),
    method,
    status: z.enum(["PENDING", "FAILED", "SUCCESS"]),
  })
  .strict();
export async function checkout(raw: unknown) {
  const input = simulation.parse(raw);
  return db.$transaction(async (tx) => {
    const link = await getLink(input.linkId, scope, tx);
    const prior = await tx.attempt.findUnique({
      where: { requestId: input.requestId },
    });
    if (prior) {
      if (
        prior.linkId !== link.id ||
        prior.method !== input.method ||
        prior.status !== input.status
      )
        throw Error("Request already used");
      return prior;
    }
    if (
      !link.activeSlot ||
      expired(link.expires) ||
      link.order.status !== "OPEN"
    )
      throw Error("Checkout closed");
    if (!link.methods.split(",").includes(input.method))
      throw Error("Method disabled");
    if (input.status === "SUCCESS")
      await tx.order.update({
        where: { id: link.orderId, merchant: scope, status: "OPEN" },
        data: { status: "PAID" },
      });
    return tx.attempt.create({
      data: {
        ...input,
        merchant: scope,
        orderId: link.orderId,
        settlement: input.status === "SUCCESS" ? link.orderId : null,
      },
    });
  });
}
