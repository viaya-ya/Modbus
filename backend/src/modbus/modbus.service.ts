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

  async scanForDevice(opts: { slaveId?: number; baudRate?: number }): Promise<ConnectOptions | null> {
    const ports = await this.listPorts();
    const slaveId = opts.slaveId ?? 1;
    const baudRate = opts.baudRate ?? 9600;

    for (const port of ports) {
      const tmp = new ModbusRTU();
      try {
        await tmp.connectRTUBuffered(port.path, {
          baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
        });
        tmp.setID(slaveId);
        tmp.setTimeout(500);
        await tmp.readHoldingRegisters(0, 1);
        await new Promise<void>(resolve => tmp.close(() => resolve()));
        return { portPath: port.path, baudRate, slaveId };
      } catch {
        try { await new Promise<void>(resolve => tmp.close(() => resolve())); } catch { /* ignore */ }
      }
    }
    return null;
  }
}
