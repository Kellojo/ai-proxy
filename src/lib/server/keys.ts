import crypto from "node:crypto";

export function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateVirtualKeyPlaintext(): string {
  const token = crypto.randomBytes(24).toString("hex");
  return `vk_${token}`;
}

export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
