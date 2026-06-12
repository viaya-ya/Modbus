import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import ModbusRTU from 'modbus-serial';
import { SerialPort } from 'serialport';

export interface ConnectOptions {
  portPath: string;
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  busy: boolean;
}

@Injectable()
export class ModbusService implements OnModuleDestroy {
  readonly events = new EventEmitter();

  private client = new ModbusRTU();
  private connected = false;
  private options: ConnectOptions | null = null;
  private intentionalDisconnect = false;
  private watchdogTimer: NodeJS.Timeout | null = null;

  // Serialises all bus operations so concurrent setID+read pairs don't race
  private mutexTail: Promise<void> = Promise.resolve();

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mutexTail.then(fn);
    this.mutexTail = result.then(() => {}, () => {});
    return result;
  }

  isConnected() {
    return this.connected;
  }

  getStatus() {
    return { connected: this.connected, options: this.options };
  }

  async connect(opts: ConnectOptions): Promise<void> {
    if (this.connected) await this.disconnect();
    this.intentionalDisconnect = false;
    await this.client.connectRTUBuffered(opts.portPath, {
      baudRate: opts.baudRate,
      dataBits: opts.dataBits ?? 8,
      stopBits: opts.stopBits ?? 1,
      parity: opts.parity ?? 'none',
    });
    this.client.setTimeout(2000);
    this.connected = true;
    this.options = opts;
    this.startWatchdog();
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.stopWatchdog();
    if (!this.connected) return;
    try {
      await new Promise<void>(resolve => this.client.close(() => resolve()));
    } catch { /* ignore close errors */ }
    this.connected = false;
    this.options = null;
  }

  private startWatchdog() {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.connected && !this.client.isOpen && !this.intentionalDisconnect) {
        this.connected = false;
        this.stopWatchdog();
        this.events.emit('connection:lost');
      }
    }, 3000);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  async readRegister(register: number, slaveId: number): Promise<number> {
    return this.withLock(async () => {
      this.client.setID(slaveId);
      const data = await this.client.readHoldingRegisters(register, 1);
      return data.data[0];
    });
  }

  async writeRegister(register: number, rawValue: number, slaveId: number): Promise<void> {
    return this.withLock(async () => {
      this.client.setID(slaveId);
      await this.client.writeRegister(register, rawValue);
    });
  }

  async listPorts(): Promise<PortInfo[]> {
    const ports = await SerialPort.list();
    const results = await Promise.all(ports.map(async p => {
      const busy = await this.isPortBusy(p.path);
      return {
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId,
        busy,
      };
    }));
    return results;
  }

  private isPortBusy(path: string): Promise<boolean> {
    return new Promise(resolve => {
      const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
      port.open(err => {
        if (err) {
          resolve(true);
        } else {
          port.close(() => resolve(false));
        }
      });
    });
  }

  async identifyDevice(slaveId: number): Promise<'vh' | 'pump' | 'unknown'> {
    return this.withLock(async () => {
      this.client.setTimeout(500);
      try {
        this.client.setID(slaveId);

        // P0.00 (0xF000) — Режим работы: VH возвращает 1 (тяжёлый) или 2 (нормальный)
        const modeData = await this.client.readHoldingRegisters(0xF000, 1);
        const mode = modeData.data[0];
        if (mode !== 1 && mode !== 2) throw new Error('unexpected mode value');

        // P7.07 (0xF707) — Температура IGBT: VH возвращает 0–120 °C (scale=1)
        const tempData = await this.client.readHoldingRegisters(0xF707, 1);
        const temp = tempData.data[0];
        if (temp < 0 || temp > 120) throw new Error('unexpected temp value');

        return 'vh';
      } catch {
        try {
          // Pump отвечает на регистр 0
          await this.client.readHoldingRegisters(0, 1);
          return 'pump';
        } catch {
          return 'unknown';
        }
      } finally {
        this.client.setTimeout(2000);
      }
    });
  }

  async probeDevice(slaveId: number): Promise<{ slaveId: number; mei1: object; mei2: object; mei3: object; fc17: object }>
  {
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
        ),
      ]);

    const readMei = async (code: number) => {
      try {
        const result = await withTimeout(this.client.readDeviceIdentification(code, 0x00), 1000);
        return { conformityLevel: result.conformityLevel, data: result.data };
      } catch (e: any) {
        return { error: e?.message ?? String(e) };
      }
    };

    return this.withLock(async () => {
      this.client.setID(slaveId);
      const mei1 = await readMei(1);
      const mei2 = await readMei(2);
      const mei3 = await readMei(3);
      let fc17: object;
      try {
        const result = await withTimeout(this.client.reportServerID(0), 1000);
        fc17 = {
          serverId: result.serverId,
          running: result.running,
          additionalDataHex: result.additionalData.toString('hex'),
          additionalDataText: result.additionalData.toString('utf8').replace(/[^\x20-\x7E]/g, '?'),
        };
      } catch (e: any) {
        fc17 = { error: e?.message ?? String(e) };
      }
      return { slaveId, mei1, mei2, mei3, fc17 };
    });
  }

  async scanBus(
    from: number,
    to: number,
    onProgress: (addr: number, found: number[]) => void,
    isCancelled: () => boolean,
  ): Promise<number[]> {
    const found: number[] = [];
    for (let addr = from; addr <= to; addr++) {
      if (isCancelled()) break;
      const responded = await this.withLock(async () => {
        this.client.setTimeout(150);
        try {
          this.client.setID(addr);
          // Пробуем PUMP-диапазон (0) и VH-диапазон (0xF000)
          try {
            await this.client.readHoldingRegisters(0, 1);
            return true;
          } catch {
            await this.client.readHoldingRegisters(0xF000, 1);
            return true;
          }
        } catch {
          return false;
        } finally {
          this.client.setTimeout(2000);
        }
      });
      if (isCancelled()) break;
      if (responded) found.push(addr);
      onProgress(addr, [...found]);
    }
    return found;
  }

  async findAdapterPort(opts: { baudRate?: number }): Promise<{ portPath: string; baudRate: number } | null> {
    const ports = await this.listPorts();
    if (!ports.length) return null;

    const knownVids = [
      '10c4',  // Silicon Labs CP2102/CP2104 (Elhart EDC-A1-U1)
      '0403',  // FTDI FT232
      '1a86',  // WCH CH340/CH341
      '067b',  // Prolific PL2303
      '04d8',  // Microchip MCP2200
    ];
    const knownManufacturers = ['silicon', 'ftdi', 'wch', 'prolific', 'microchip'];

    const baudRate = opts.baudRate ?? 9600;

    let found = ports.find(p => p.vendorId && knownVids.includes(p.vendorId.toLowerCase()));

    if (!found) {
      found = ports.find(p =>
        p.manufacturer && knownManufacturers.some(m => p.manufacturer!.toLowerCase().includes(m)),
      );
    }

    if (!found && ports.length === 1) found = ports[0];

    if (!found) return null;
    return { portPath: found.path, baudRate };
  }

  async onModuleDestroy() {
    await this.disconnect();
  }
}
