import crypto from 'node:crypto'

// 62-char alphabet (a-z, A-Z, 0-9) for URL-safe unambiguous IDs.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Cryptographically-strong random ID of given length drawn from ALPHABET.
 * Length 8  -> 62^8  ≈ 218 trillion possibilities  (permanent endpoint)
 * Length 24 -> 62^24 ≈ 2.8e43 possibilities        (one-time flash token)
 */
export function randomId(length: number): string {
  const bytes = crypto.randomBytes(length)
  const out: string[] = []
  for (let i = 0; i < length; i++) {
    out.push(ALPHABET[bytes[i] % ALPHABET.length])
  }
  return out.join('')
}

/** 8-char permanent endpoint id, e.g. "gb73h83h" */
export const newEndpointId = () => randomId(8)

/** 24-char one-time flash token */
export const newFlashToken = () => randomId(24)
