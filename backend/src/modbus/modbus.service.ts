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
      try {
        this.client.setID(slaveId);
        await this.client.readHoldingRegisters(0xF000, 1);
        return 'vh';
      } catch {
        try {
          this.client.setID(slaveId);
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
