declare module "wake_on_lan" {
  type WakeOptions = {
    address?: string;
    num_packets?: number;
    interval?: number;
    port?: number;
  };

  function createMagicPacket(mac: string): Buffer;
  function wake(
    mac: string,
    options?: WakeOptions,
    callback?: (error?: unknown) => void,
  ): void;

  const wakeOnLan: {
    createMagicPacket: typeof createMagicPacket;
    wake: typeof wake;
  };

  export = wakeOnLan;
}
