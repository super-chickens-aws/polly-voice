function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export interface PkceAuthorization {
  verifier: string
  challenge: string
  state: string
}

export async function createPkceAuthorization(): Promise<PkceAuthorization> {
  const verifier = randomBase64Url(64)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )

  return {
    verifier,
    challenge: toBase64Url(new Uint8Array(digest)),
    state: randomBase64Url(32),
  }
}
