import wakeOnLan from "wake_on_lan";

const DEFAULT_WOL_PACKET_BURST = 3;
const DEFAULT_WOL_BURST_INTERVAL_MS = 120;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

const WOL_PACKET_BURST = readPositiveIntEnv(
  "WOL_PACKET_BURST",
  DEFAULT_WOL_PACKET_BURST,
);
const WOL_BURST_INTERVAL_MS = readPositiveIntEnv(
  "WOL_BURST_INTERVAL_MS",
  DEFAULT_WOL_BURST_INTERVAL_MS,
);

function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

export function createMagicPacket(macAddress: string): Buffer {
  const normalized = normalizeMac(macAddress);
  if (normalized.length !== 12) {
    throw new Error("Invalid MAC address format for Wake-on-LAN");
  }

  return wakeOnLan.createMagicPacket(normalized);
}

export async function sendWakeOnLan(
  macAddress: string,
  broadcastAddress = "255.255.255.255",
  port = 9,
): Promise<void> {
  const normalized = normalizeMac(macAddress);
  if (normalized.length !== 12) {
    throw new Error("Invalid MAC address format for Wake-on-LAN");
  }

  await new Promise<void>((resolve, reject) => {
    wakeOnLan.wake(
      normalized,
      {
        address: broadcastAddress,
        port,
        num_packets: WOL_PACKET_BURST,
        interval: WOL_BURST_INTERVAL_MS,
      },
      (error?: unknown) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}
