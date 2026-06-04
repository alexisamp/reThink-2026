/**
 * Value Ledger — Jacob Warwick's reciprocity imbalance, made measurable.
 *
 * The thesis (Networking module): deliver DISPROPORTIONATE value FIRST so the
 * other person feels they owe you and becomes your advocate. You WANT to be a
 * net giver. The day you're a net taker, the relationship cools.
 *
 * Pure functions, no React — mirrors the shape of connectionStrength.ts.
 */
import type { ValueLog, ValueLogType } from '@/types'

export type LedgerBucket = 'champion' | 'healthy' | 'neutral' | 'owe_them' | 'taker'

export interface LedgerResult {
  given: number // weighted sum of value given
  received: number // weighted sum of value received
  givenCount: number
  receivedCount: number
  balance: number // given - received (positive = net giver, the healthy state)
  bucket: LedgerBucket
  label: string
  suggestion: string
}

/**
 * Weight per value type — an introduction to a super-connector is worth more
 * than sharing an article. Keeps the score honest without per-item UI.
 */
const TYPE_WEIGHT: Record<ValueLogType, number> = {
  introduction: 3,
  opportunity: 3,
  referral: 3,
  endorsement: 2,
  advice: 2,
  candor: 2,
  content: 1,
  other: 1,
}

export function valueWeight(type: ValueLogType): number {
  return TYPE_WEIGHT[type] ?? 1
}

const BUCKET_LABEL: Record<LedgerBucket, string> = {
  champion: 'Champion',
  healthy: 'Net giver',
  neutral: 'Balanced',
  owe_them: 'You owe them',
  taker: 'Net taker',
}

const BUCKET_SUGGESTION: Record<LedgerBucket, string> = {
  champion: 'Strong reciprocity imbalance in your favor — they will advocate for you. Keep the cadence.',
  healthy: "You're giving more than you take. Good — this is where relationships compound.",
  neutral: 'Balanced exchange. Look for a way to give first and tip it in your favor.',
  owe_them: 'You owe them. Give value before you ask for anything.',
  taker: "They're giving far more than they get back. Rebalance fast or the relationship will cool.",
}

function bucketFor(balance: number): LedgerBucket {
  if (balance >= 6) return 'champion'
  if (balance >= 1) return 'healthy'
  if (balance === 0) return 'neutral'
  if (balance >= -4) return 'owe_them'
  return 'taker'
}

export function computeLedger(logs: ValueLog[]): LedgerResult {
  let given = 0
  let received = 0
  let givenCount = 0
  let receivedCount = 0
  for (const log of logs) {
    const w = valueWeight(log.type)
    if (log.direction === 'received') {
      received += w
      receivedCount += 1
    } else {
      given += w
      givenCount += 1
    }
  }
  const balance = given - received
  const bucket = bucketFor(balance)
  return {
    given,
    received,
    givenCount,
    receivedCount,
    balance,
    bucket,
    label: BUCKET_LABEL[bucket],
    suggestion: BUCKET_SUGGESTION[bucket],
  }
}

/** True when you owe the contact value (net taker territory). */
export function owesValue(balance: number): boolean {
  return balance < 0
}
