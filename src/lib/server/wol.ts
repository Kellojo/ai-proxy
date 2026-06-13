import dgram from "node:dgram";

function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

export function createMagicPacket(macAddress: string): Buffer {
  const normalized = normalizeMac(macAddress);
  if (normalized.length !== 12) {
    throw new Error("Invalid MAC address format for Wake-on-LAN");
  }

  const macBytes = Buffer.from(normalized, "hex");
  const header = Buffer.alloc(6, 0xff);
  const body = Buffer.alloc(16 * 6);

  for (let i = 0; i < 16; i += 1) {
    macBytes.copy(body, i * 6);
  }

  return Buffer.concat([header, body]);
}

export async function sendWakeOnLan(
  macAddress: string,
  broadcastAddress = "255.255.255.255",
  port = 9,
): Promise<void> {
  const packet = createMagicPacket(macAddress);

  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");

    socket.once("error", (error) => {
      socket.close();
      reject(error);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, port, broadcastAddress, (error) => {
        socket.close();
        if (error) reject(error);
        else resolve();
      });
    });
  });
}
