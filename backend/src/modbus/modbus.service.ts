import { Injectable } from '@nestjs/common';
import ModbusRTU from 'modbus-serial';

export interface ConnectOptions {
  portPath: string;
  baudRate: number;
  slaveId: number;
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
}
