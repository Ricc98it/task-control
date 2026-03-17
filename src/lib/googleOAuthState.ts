import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export type GoogleOAuthStatePayload = {
  userId: string;
  iat: number;
  exp: number;
  nonce: string;
};

const DEFAULT_TTL_SECONDS = 10 * 60;

function requireStateSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: GOOGLE_OAUTH_STATE_SECRET");
  }
  return secret;
}

function encodeBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

function decodeBase64Url(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", requireStateSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createGoogleOAuthState(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: GoogleOAuthStatePayload = {
    userId,
    iat: now,
    exp: now + DEFAULT_TTL_SECONDS,
    nonce: randomUUID(),
  };

  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyGoogleOAuthState(raw: string): GoogleOAuthStatePayload | null {
  const [payloadB64, signature] = raw.split(".");
  if (!payloadB64 || !signature) return null;

  const expected = sign(payloadB64);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(payloadB64)) as Partial<GoogleOAuthStatePayload>;
    if (!parsed.userId || !parsed.iat || !parsed.exp || !parsed.nonce) return null;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp < now) return null;
    return {
      userId: parsed.userId,
      iat: parsed.iat,
      exp: parsed.exp,
      nonce: parsed.nonce,
    };
  } catch {
    return null;
  }
}

