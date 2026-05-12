/**
 * Minimal UUIDv7 generator. Spec: draft-ietf-uuidrev-rfc4122bis-14 §5.7.
 *
 * Layout (16 bytes):
 *   48-bit unix-ms timestamp · 4-bit version (0x7) · 12 rand bits ·
 *   2-bit variant (0b10) · 62 rand bits
 *
 * We pull randomness from crypto.getRandomValues, which is available in
 * both browser and Node ≥ 19. No deps.
 *
 * UUIDv7 sorts lexicographically by creation time — important here
 * because reading_session ids are time-ordered, and event ids inside a
 * session sort by clientCreatedAt up to the ms.
 */
export function uuidv7(): string {
  const ms = Date.now();
  const bytes = new Uint8Array(16);

  // 48-bit timestamp (big-endian) into bytes[0..6).
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // 10 random bytes for the rest.
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);
  bytes.set(rand, 6);

  // Stamp version (0x7) into the high nibble of byte 6.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Stamp variant (0b10) into the high two bits of byte 8.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}
