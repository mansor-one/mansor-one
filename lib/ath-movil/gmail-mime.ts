type GmailPart = {
  mimeType?: string
  body?: { data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

function decodeBase64Url(value: string | undefined) {
  if (!value) return null
  try {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
}

function findPart(part: GmailPart | undefined, mimeType: string): string | null {
  if (!part) return null
  if (part.mimeType === mimeType) return decodeBase64Url(part.body?.data)
  for (const child of part.parts || []) {
    const value = findPart(child, mimeType)
    if (value) return value
  }
  return null
}

export function extractGmailMimeText(payload: GmailPart | undefined) {
  return {
    plainText: findPart(payload, 'text/plain'),
    htmlText: findPart(payload, 'text/html'),
  }
}

async function findPartWithAttachments(
  part: GmailPart | undefined,
  mimeType: string,
  loadAttachment: (attachmentId: string) => Promise<string | null>
): Promise<string | null> {
  if (!part) return null
  if (part.mimeType === mimeType) {
    const inline = decodeBase64Url(part.body?.data)
    if (inline) return inline
    if (part.body?.attachmentId) {
      return decodeBase64Url((await loadAttachment(part.body.attachmentId)) || undefined)
    }
  }
  for (const child of part.parts || []) {
    const value = await findPartWithAttachments(child, mimeType, loadAttachment)
    if (value) return value
  }
  return null
}

export async function extractGmailMimeTextWithAttachments(
  payload: GmailPart | undefined,
  loadAttachment: (attachmentId: string) => Promise<string | null>
) {
  return {
    plainText: await findPartWithAttachments(payload, 'text/plain', loadAttachment),
    htmlText: await findPartWithAttachments(payload, 'text/html', loadAttachment),
  }
}
