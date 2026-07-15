export type OutreachMetricId = 'reached' | 'accepted' | 'replies' | 'meetings' | 'intros'

export const OUTREACH_EVENT_TYPES: Record<OutreachMetricId, readonly string[]> = {
  reached: ['request_sent', 'follow_up_sent', 'reached'],
  accepted: ['accepted_detected', 'accepted'],
  replies: ['inbound_reply_received', 'replies'],
  meetings: ['meeting_scheduled', 'meetings'],
  intros: ['intro_made', 'intros'],
}

const METRIC_BY_EVENT_TYPE = new Map<string, OutreachMetricId>(
  Object.entries(OUTREACH_EVENT_TYPES).flatMap(([metric, eventTypes]) =>
    eventTypes.map(eventType => [eventType, metric as OutreachMetricId] as const),
  ),
)

export function metricForOutreachEvent(eventType: string): OutreachMetricId | null {
  return METRIC_BY_EVENT_TYPE.get(eventType) ?? null
}

export function eventTypesForMetric(metric: string): readonly string[] {
  return metric in OUTREACH_EVENT_TYPES
    ? OUTREACH_EVENT_TYPES[metric as OutreachMetricId]
    : []
}
