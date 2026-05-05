import { Injectable } from '@nestjs/common';
import ModbusRTU from 'modbus-serial';
import { SerialPort } from 'serialport';

export interface ConnectOptions {
  portPath: string;
  baudRate: number;
  slaveId: number;
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
  private client = new ModbusRTU();
  private connected = false;
  private options: ConnectOptions | null = null;

  isConnected() {
    return this.connected;
  }

  getStatus() {
    return { connected: this.connected, options: this.options };
  }

  async connect(opts: ConnectOptions): Promise<void> {
    if (this.connected) await this.disconnect();
    await this.client.connectRTUBuffered(opts.portPath, {
      baudRate: opts.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    });
    this.client.setID(opts.slaveId);
    this.client.setTimeout(2000);
    this.connected = true;
    this.options = opts;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await new Promise<void>(resolve => this.client.close(() => resolve()));
    this.connected = false;
    this.options = null;
  }

  async readRegister(register: number): Promise<number> {
    const data = await this.client.readHoldingRegisters(register, 1);
    return data.data[0];
  }

  async writeRegister(register: number, rawValue: number): Promise<void> {
    await this.client.writeRegister(register, rawValue);
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

  async findAdapterPort(opts: { slaveId?: number; baudRate?: number }): Promise<ConnectOptions | null> {
    const ports = await this.listPorts();
    if (!ports.length) return null;

    // USB VID-ы распространённых чипов USB→Serial (RS-485 адаптеры)
    const knownVids = [
      '10c4',  // Silicon Labs CP2102/CP2104 (Elhart EDC-A1-U1)
      '0403',  // FTDI FT232
      '1a86',  // WCH CH340/CH341
      '067b',  // Prolific PL2303
      '04d8',  // Microchip MCP2200
    ];
    const knownManufacturers = ['silicon', 'ftdi', 'wch', 'prolific', 'microchip'];

    const slaveId = opts.slaveId ?? 1;
    const baudRate = opts.baudRate ?? 9600;

    // 1. Ищем по VID
    let found = ports.find(p => p.vendorId && knownVids.includes(p.vendorId.toLowerCase()));

    // 2. Ищем по названию производителя
    if (!found) {
      found = ports.find(p =>
        p.manufacturer && knownManufacturers.some(m => p.manufacturer!.toLowerCase().includes(m)),
      );
    }

    // 3. Если порт один — берём его
    if (!found && ports.length === 1) found = ports[0];

    if (!found) return null;
    return { portPath: found.path, baudRate, slaveId };
  }
}
