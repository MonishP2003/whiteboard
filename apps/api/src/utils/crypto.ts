import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

// ---- Passwords (argon2id, library defaults) ----

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// ---- Access tokens (HS256 JWT) ----

export const ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface TokenPayload {
  id: string;
  email: string;
}

export function signAccessToken({ id, email }: TokenPayload): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/** Returns null for any invalid, expired or malformed token. */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
