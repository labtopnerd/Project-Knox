/**
 * Email notification service using Resend.
 * Free tier: 3,000 emails/month.
 * Register at https://resend.com/ and add RESEND_API_KEY to your env.
 *
 * If RESEND_API_KEY is not set, emails are logged to console (dev mode).
 */

import { Resend } from 'resend'

let resend: Resend | null = null

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Email] RESEND_API_KEY not set — emails will be logged to console only.')
    }
    return null
  }
  if (!resend) resend = new Resend(key)
  return resend
}

const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@projectknox.app'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export interface NewBillEmailPayload {
  to: string
  userName: string
  bills: Array<{
    id: string
    billNumber: string | null
    title: string
    repName: string
    chamber: string
    status: string
  }>
}

export interface BillStatusEmailPayload {
  to: string
  userName: string
  billId: string
  billNumber: string | null
  billTitle: string
  oldStatus: string
  newStatus: string
}

/**
 * Send a digest email for newly synced bills from the user's representatives.
 */
export async function sendNewBillsEmail(payload: NewBillEmailPayload): Promise<void> {
  const { to, userName, bills } = payload

  const billRows = bills
    .map(
      (b) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <a href="${APP_URL}/bills/${b.id}" style="color:#2563eb;text-decoration:none;font-weight:600;">
              ${b.billNumber ? `${b.billNumber} — ` : ''}${b.title}
            </a>
            <br>
            <span style="font-size:12px;color:#6b7280;">${b.repName} · ${b.chamber} · ${b.status}</span>
          </td>
        </tr>`,
    )
    .join('')

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:580px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">🏛️ Project Knox</h1>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:14px;">New bills from your representatives</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 16px;color:#374151;">Hi ${userName ?? 'there'},</p>
        <p style="margin:0 0 20px;color:#374151;">
          ${bills.length} new bill${bills.length !== 1 ? 's' : ''} from your representatives ${bills.length !== 1 ? 'have' : 'has'} been introduced or updated.
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <tbody>${billRows}</tbody>
        </table>
        <div style="margin-top:24px;text-align:center;">
          <a href="${APP_URL}/feed"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
            View your full feed →
          </a>
        </div>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
          You're receiving this because you enabled bill notifications in
          <a href="${APP_URL}/settings" style="color:#6b7280;">Project Knox settings</a>.
        </p>
      </div>
    </div>
  `

  const client = getResend()
  if (!client) {
    console.log(`[Email:dev] New bills email to ${to}:`, bills.map((b) => b.title))
    return
  }

  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `${bills.length} new bill${bills.length !== 1 ? 's' : ''} from your representatives`,
    html,
  })

  if (error) {
    console.error('[Email] Failed to send new-bills email:', error)
  }
}

/**
 * Send a single bill status change notification.
 */
export async function sendBillStatusEmail(payload: BillStatusEmailPayload): Promise<void> {
  const { to, userName, billId, billNumber, billTitle, oldStatus, newStatus } = payload

  const statusEmoji: Record<string, string> = {
    passed: '✅',
    signed: '🎉',
    failed: '❌',
    vetoed: '🚫',
    committee: '📋',
    floor: '🏛️',
    passed_chamber: '➡️',
  }

  const emoji = statusEmoji[newStatus] ?? '📢'
  const displayStatus = newStatus.replace(/_/g, ' ')

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:580px;margin:0 auto;color:#111827;">
      <div style="background:#1e3a8a;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">🏛️ Project Knox</h1>
        <p style="color:#bfdbfe;margin:4px 0 0;font-size:14px;">Bill status update</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 16px;color:#374151;">Hi ${userName ?? 'there'},</p>
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${billNumber ?? 'Bill'}</p>
          <p style="margin:0;font-weight:600;color:#111827;">${billTitle}</p>
        </div>
        <p style="margin:0 0 8px;color:#374151;">Status has changed:</p>
        <p style="margin:0;font-size:16px;">
          <span style="color:#6b7280;">${oldStatus.replace(/_/g, ' ')}</span>
          &nbsp;→&nbsp;
          <strong style="color:#111827;">${emoji} ${displayStatus}</strong>
        </p>
        <div style="margin-top:24px;text-align:center;">
          <a href="${APP_URL}/bills/${billId}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
            View bill & vote →
          </a>
        </div>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
          <a href="${APP_URL}/settings" style="color:#6b7280;">Manage notifications</a>
        </p>
      </div>
    </div>
  `

  const client = getResend()
  if (!client) {
    console.log(`[Email:dev] Bill status email to ${to}: "${billTitle}" → ${newStatus}`)
    return
  }

  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `${emoji} ${billNumber ?? 'A bill'} is now: ${displayStatus}`,
    html,
  })

  if (error) {
    console.error('[Email] Failed to send bill-status email:', error)
  }
}
