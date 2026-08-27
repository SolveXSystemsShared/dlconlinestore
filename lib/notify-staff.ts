/**
 * Staff notification for events that need a human in CDASH.
 *
 * Posts to STAFF_NOTIFY_WEBHOOK_URL when it is configured — point it at a
 * WhatsApp Cloud API relay, a Slack incoming webhook, or any endpoint that
 * accepts JSON. When it is not configured the event is logged to the server
 * console instead, so nothing is silently dropped.
 *
 * Never throws: a notification failure must not fail the user's registration.
 */
type StaffEvent = {
  event: string
  title: string
  detail: Record<string, string | number | null>
}

export async function notifyStaff(payload: StaffEvent): Promise<{ delivered: boolean; reason?: string }> {
  const url = process.env.STAFF_NOTIFY_WEBHOOK_URL
  if (!url) {
    console.info(`[staff-notify] ${payload.event}: ${payload.title}`, payload.detail)
    return { delivered: false, reason: "STAFF_NOTIFY_WEBHOOK_URL is not configured" }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.STAFF_NOTIFY_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.STAFF_NOTIFY_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) {
      console.error(`[staff-notify] webhook returned ${response.status} for ${payload.event}`)
      return { delivered: false, reason: `webhook returned ${response.status}` }
    }
    return { delivered: true }
  } catch (reason) {
    console.error(`[staff-notify] webhook failed for ${payload.event}`, reason)
    return { delivered: false, reason: reason instanceof Error ? reason.message : "webhook request failed" }
  }
}
