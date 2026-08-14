import crypto from "node:crypto";

const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const stored = Buffer.from(hash, "hex");
  // timingSafeEqual throws on a length mismatch, which would turn a corrupt or
  // legacy hash into a 500 instead of a failed login. A stored hash that is not
  // the expected width cannot match any candidate anyway.
  if (stored.length !== KEY_LENGTH) {
    return false;
  }

  const candidate = await scrypt(password, salt);
  return crypto.timingSafeEqual(stored, Buffer.from(candidate, "hex"));
}

function scrypt(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });
}
