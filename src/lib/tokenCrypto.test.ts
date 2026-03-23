import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "./tokenCrypto";

// A valid 64-char hex key (32 bytes) for testing only
const TEST_KEY = "a".repeat(64);

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a token correctly", () => {
    const original = "ya29.some_google_access_token";
    expect(decryptToken(encryptToken(original))).toBe(original);
  });

  it("round-trips an empty string", () => {
    expect(decryptToken(encryptToken(""))).toBe("");
  });

  it("round-trips a token with special characters", () => {
    const original = "1//0abc-XYZ_+/=refreshToken==";
    expect(decryptToken(encryptToken(original))).toBe(original);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const token = "same_token";
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);
    expect(enc1).not.toBe(enc2);
    // Both still decrypt correctly
    expect(decryptToken(enc1)).toBe(token);
    expect(decryptToken(enc2)).toBe(token);
  });

  it("encrypted value starts with enc:v1: prefix", () => {
    expect(encryptToken("hello")).toMatch(/^enc:v1:/);
  });
});

describe("decryptToken backward compat", () => {
  it("returns plaintext values as-is (pre-migration tokens)", () => {
    const plaintext = "ya29.plaintext_token_from_before_migration";
    expect(decryptToken(plaintext)).toBe(plaintext);
  });

  it("returns empty string as-is", () => {
    expect(decryptToken("")).toBe("");
  });
});

describe("encryptToken key validation", () => {
  it("throws when TOKEN_ENCRYPTION_KEY is missing", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptToken("token")).toThrow("TOKEN_ENCRYPTION_KEY");
  });

  it("throws when TOKEN_ENCRYPTION_KEY is too short", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "abc123");
    expect(() => encryptToken("token")).toThrow("TOKEN_ENCRYPTION_KEY");
  });
});
