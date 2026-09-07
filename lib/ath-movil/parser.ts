import { createHash } from 'node:crypto'
import type { AthEmailParserInput, ParsedAthEmail, ParsedField } from './types'

export const ATH_PARSER_VERSION = 'ath-email-v2'
export const ATH_TIMEZONE = 'America/Puerto_Rico' as const

export function htmlToSafeText(html: string | null) {
  if (!html) return null
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function capture(text: string, patterns: Array<{ re: RegExp; name: string }>) {
  for (const pattern of patterns) {
    const match = text.match(pattern.re)
    if (match?.[1]?.trim()) return { value: match[1].trim(), pattern: pattern.name }
  }
  return { value: null, pattern: undefined }
}

function field(value: unknown, pattern?: string): ParsedField {
  return { value, found: value !== null && value !== '', ...(pattern ? { pattern } : {}) }
}

function normalizedName(value: string | null) {
  return value?.replace(/\s+-\s*\(?\*?\d{4}\)?\s*$/, '').replace(/\s+/g, ' ').trim() || null
}

function parseOccurredAt(value: string | null, fallback: string) {
  if (!value) return fallback || null
  const normalizedValue = value.replace(/\s+at\s+/i, ' ').trim()
  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2}|\b(?:ast|utc|gmt)\b)$/i.test(normalizedValue)
  const parsed = new Date(hasExplicitTimezone ? normalizedValue : `${normalizedValue} -04:00`)
  return Number.isNaN(parsed.getTime()) ? fallback || null : parsed.toISOString()
}

export function parseAthEmail(input: AthEmailParserInput): ParsedAthEmail {
  const htmlText = htmlToSafeText(input.htmlText)
  const body = input.plainText?.trim() || htmlText || input.snippet?.trim() || ''
  const text = `${input.subject || ''}\n${body}`.replace(/\s+/g, ' ').trim()
  const amount = capture(text, [{ re: /\$\s*([\d,]+(?:\.\d{2})?)/i, name: 'currency_amount' }])
  const amountCents = amount.value ? Math.round(Number(amount.value.replace(/,/g, '')) * 100) : null
  const date = capture(text, [
    { re: /(?:Date|Fecha):\*?\s*([^|]+?)(?=\s+\*?(?:Amount|Monto|Message|Mensaje|Reference|Referencia|From|To|Sent to|Paid to|Enviado a|Pagado a|$))/i, name: 'labeled_date' },
  ])
  const reference = capture(text, [
    { re: /(?:Reference|Referencia|Confirmation|Confirmaci[oó]n)(?:\s*(?:number|n[uú]mero|#))?\s*:\s*([A-Z0-9-]+)/i, name: 'labeled_reference' },
  ])
  const phone = capture(text, [
    { re: /(?:Phone|Tel[eé]fono):\s*.{0,30}?(\d{4})\b/i, name: 'labeled_phone_last4' },
    { re: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?(\d{4})\b/, name: 'phone_last4' },
    { re: /(?:\*|•|x){2,}\s*(\d{4})\b/i, name: 'masked_phone_last4' },
  ])
  const message = capture(text, [
    { re: /(?:Message|Mensaje):\s*(.*?)(?=\s+(?:Reference|Referencia|If you|As a reminder|Gracias|Thanks|$))/i, name: 'labeled_message' },
  ])
  const source = capture(text, [
    { re: /(?:From card|Card|Tarjeta de origen):\*?\s*(.*?)(?=\s+\*?(?:To card|Tarjeta destino|Sent to|Enviado a|Date|Fecha|Message|Mensaje|$))/i, name: 'source_descriptor' },
  ])
  const destination = capture(text, [
    { re: /(?:To card|Tarjeta destino|To):\s*(.*?)(?=\s+(?:Date|Fecha|Message|Mensaje|$))/i, name: 'destination_descriptor' },
  ])

  const isSecurityAlert = /SECURITY ALERT:\s*Recent Login in ATH M[oó]vil/i.test(text)
  let direction: ParsedAthEmail['direction'] = 'unknown'
  if (/transferred between cards|entre (?:mis )?tarjetas/i.test(text)) direction = 'internal_transfer'
  else if (/transfer receipt:\s*\$[\d,.]+\s+from\b|you received|received from|sent by|recibiste|enviado por/i.test(text)) direction = 'received'
  else if (/transfer receipt:\s*\$[\d,.]+\s+to\b|you paid|payment receipt|sent to|enviaste|pagaste|enviado a/i.test(text)) direction = 'sent'

  const counterparty = direction === 'received'
    ? capture(text, [
        { re: /(?:Sent by|Received from|Enviado por|Recibido de):\s*(.*?)(?=\s+(?:Date|Fecha|Message|Mensaje|Phone|Tel[eé]fono|\(|$))/i, name: 'counterparty_received' },
        { re: /(?:From|De):\s*(.*?)(?=\s+(?:Date|Fecha|Amount|Monto|Message|Mensaje|Phone|Tel[eé]fono|\(|$))/i, name: 'counterparty_received_from' },
        { re: /You received \$[\d,.]+ from (.*?)(?=\s+(?:Date|Amount|Message|$))/i, name: 'subject_received_from' },
        { re: /Transfer receipt:\s*\$[\d,.]+\s+from\s+(.*?)(?=\s+(?:Date|Amount|Message|$))/i, name: 'subject_transfer_from' },
      ])
    : capture(text, [
        { re: /(?:Sent to|Paid to|Enviado a|Pagado a):\s*(.*?)(?=\s+(?:Date|Fecha|Message|Mensaje|\(|$))/i, name: 'counterparty_sent' },
        { re: /You paid \$[\d,.]+ to (.*?)(?=\s+(?:Date|Message|$))/i, name: 'subject_paid_to' },
        { re: /Transfer receipt:\s*\$[\d,.]+\s+to\s+(.*?)(?=\s+(?:Date|Amount|Message|$))/i, name: 'subject_transfer_to' },
      ])

  const occurredAt = parseOccurredAt(date.value, input.emailReceivedAt)
  const useful = [amountCents !== null, Boolean(counterparty.value), Boolean(occurredAt), direction !== 'unknown'].filter(Boolean).length
  const parseStatus = isSecurityAlert ? 'failed' : useful === 0 ? 'failed' : useful >= 3 ? 'parsed' : 'partial'

  return {
    amountCents,
    occurredAt,
    timezone: ATH_TIMEZONE,
    direction,
    counterpartyName: normalizedName(counterparty.value),
    counterpartyPhoneLast4: phone.value,
    message: message.value,
    reference: reference.value,
    sourceDescriptor: source.value,
    destinationDescriptor: destination.value,
    parseStatus,
    financialEvidence: !isSecurityAlert,
    ignoreReason: isSecurityAlert ? 'security_alert' : null,
    parserVersion: ATH_PARSER_VERSION,
    fields: {
      amountCents: field(amountCents, amount.pattern),
      occurredAt: field(occurredAt, date.pattern || 'email_received_at_fallback'),
      direction: field(direction, 'subject_and_body_direction'),
      counterpartyName: field(normalizedName(counterparty.value), counterparty.pattern),
      counterpartyPhoneLast4: field(phone.value, phone.pattern),
      message: field(message.value, message.pattern),
      reference: field(reference.value, reference.pattern),
      sourceDescriptor: field(source.value, source.pattern),
      destinationDescriptor: field(destination.value, destination.pattern),
      financialEvidence: field(!isSecurityAlert, isSecurityAlert ? 'security_alert_subject' : 'financial_notification'),
    },
  }
}

function normalized(value: string | null | undefined) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function athContentFingerprint(householdId: string, parsed: ParsedAthEmail) {
  const minute = parsed.occurredAt?.slice(0, 16) || ''
  return createHash('sha256').update([
    householdId,
    parsed.amountCents ?? '',
    minute,
    parsed.direction,
    normalized(parsed.reference),
    parsed.counterpartyPhoneLast4 || '',
    normalized(parsed.counterpartyName),
  ].join('|')).digest('hex')
}

export function redactAthReference(value: string | null) {
  if (!value) return null
  return value.length <= 4 ? `••••${value}` : `••••${value.slice(-4)}`
}
