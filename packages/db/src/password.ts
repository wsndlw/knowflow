import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_ALGORITHM = "scrypt";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${PASSWORD_ALGORITHM}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== PASSWORD_ALGORITHM || salt === undefined || hash === undefined) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
