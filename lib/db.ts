import { PrismaClient } from '@prisma/client'
const cache = globalThis as unknown as {paypilot?: PrismaClient}
export const db = cache.paypilot ??= new PrismaClient()
export const merchant = 'studio-bangkok'
export const day = 86400000
