import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import ModbusRTU from 'modbus-serial';
import { SerialPort } from 'serialport';

export interface ConnectOptions {
  portPath: string;
  baudRate: number;
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

@Injectable()
export class ModbusService {
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
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
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
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      vendorId: p.vendorId,
      productId: p.productId,
    }));
  }

  async identifyDevice(slaveId: number): Promise<'vh' | 'pump' | 'unknown'> {
    return this.withLock(async () => {
      this.client.setTimeout(150);
      this.client.setID(slaveId);
      try {
        // FC43/0x2B MEI — Read Device Identification (code 3 = extended, object 0x00 = VendorName)
        try {
          const info = await this.client.readDeviceIdentification(3, 0x00);
          // data[0]=VendorName, data[1]=ProductCode, data[2]=MajorMinorRevision
          const product = (info.data[1] ?? '').toLowerCase();
          if (product.includes('vh')) return 'vh';
          if (product.includes('pump') || product.includes('emd')) return 'pump';
        } catch {
          // MEI не поддерживается (ELHART), пробуем FC17 Report Server ID
          try {
            // reportServerID — это FC17 (0x11), аналог сырого [slaveId, 0x11] + CRC
            await this.client.reportServerID(0);
          } catch {
            // FC17 тоже не поддерживается
          }
        }

        // Определение типа по регистрам
        try {
          await this.client.readHoldingRegisters(0xF000, 1);
          return 'vh';
        } catch {
          try {
            await this.client.readHoldingRegisters(0, 1);
            return 'pump';
          } catch {
            return 'unknown';
          }
        }
      } finally {
        this.client.setTimeout(2000);
      }
    });
  }

  async probeDevice(slaveId: number): Promise<{ slaveId: number; mei: object; fc17: object }> {
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
        ),
      ]);

    return this.withLock(async () => {
      this.client.setID(slaveId);
      let mei: object;
      let fc17: object;
      try {
        const result = await withTimeout(this.client.readDeviceIdentification(3, 0x00), 1000);
        mei = { conformityLevel: result.conformityLevel, data: result.data };
      } catch (e: any) {
        mei = { error: e?.message ?? String(e) };
      }
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
      return { slaveId, mei, fc17 };
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
}
