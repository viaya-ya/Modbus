import { Injectable, OnModuleInit, OnModuleDestroy, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import { DeviceConfig, DeviceParam } from './device.types';

@Injectable()
export class DevicesService implements OnModuleInit, OnModuleDestroy {
  readonly events = new EventEmitter();
  private devices = new Map<string, DeviceConfig>();
  private fileToId = new Map<string, string>();
  private watcher: FSWatcher | null = null;
  readonly devicesPath: string;

  readonly templatesPath: string;
  readonly unitsPath: string;

  constructor() {
    this.devicesPath = path.join(process.cwd(), '..', 'devices');
    this.templatesPath = path.join(this.devicesPath, 'templates');
    this.unitsPath = path.join(this.devicesPath, 'units');
  }

  async onModuleInit() {
    fs.mkdirSync(this.templatesPath, { recursive: true });
    fs.mkdirSync(this.unitsPath, { recursive: true });
    this.loadAll();
    await this.startWatcher();
  }

  onModuleDestroy() {
    this.watcher?.close();
  }

  private loadAll() {
    for (const dir of [this.templatesPath, this.unitsPath]) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        this.loadFile(path.join(dir, file));
      }
    }
  }

  private loadFile(filePath: string): DeviceConfig | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content) as DeviceConfig;
      const prevId = this.fileToId.get(filePath);
      if (prevId && prevId !== config.id) this.devices.delete(prevId);
      this.fileToId.set(filePath, config.id);
      this.devices.set(config.id, config);
      return config;
    } catch {
      return null;
    }
  }

  private async startWatcher() {
    const chokidar = await import('chokidar');
    this.watcher = chokidar.watch([this.templatesPath, this.unitsPath], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    this.watcher.on('add', (filePath: string) => {
      if (!filePath.endsWith('.json')) return;
      const config = this.loadFile(filePath);
      if (config) this.events.emit('device:added', config);
    });

    this.watcher.on('change', (filePath: string) => {
      if (!filePath.endsWith('.json')) return;
      const config = this.loadFile(filePath);
      if (config) this.events.emit('device:changed', config);
    });

    this.watcher.on('unlink', (filePath: string) => {
      const id = this.fileToId.get(filePath);
      if (id) {
        this.devices.delete(id);
        this.fileToId.delete(filePath);
        this.events.emit('device:removed', id);
      }
    });
  }

  getAll(): DeviceConfig[] {
    return Array.from(this.devices.values());
  }

  getById(id: string): DeviceConfig | null {
    return this.devices.get(id) ?? null;
  }

  findParam(deviceId: string, paramId: string): DeviceParam | null {
    const device = this.getById(deviceId);
    if (!device) return null;
    for (const group of device.groups) {
      const param = group.params.find(p => p.id === paramId);
      if (param) return param;
    }
    return null;
  }

  getTemplates(): DeviceConfig[] {
    return Array.from(this.devices.values()).filter(d => d.template === true);
  }

  createDevice(templateId: string, name: string, slaveId: number): DeviceConfig {
    const template = this.getById(templateId);
    if (!template) throw new NotFoundException(`Template '${templateId}' not found`);
    if (!template.template) throw new BadRequestException(`Device '${templateId}' is not a template`);

    // Spaces → underscores, strip chars forbidden in filenames (Windows + Unix)
    const baseName = name.trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') || `device_${Date.now()}`;

    // Find a unique filename: "Насос_1.json", then "Насос_1_2.json", etc.
    let fileName = `${baseName}.json`;
    let filePath = path.join(this.unitsPath, fileName);
    let counter = 2;
    while (fs.existsSync(filePath)) {
      fileName = `${baseName}_${counter}.json`;
      filePath = path.join(this.unitsPath, fileName);
      counter++;
    }

    const id = fileName.slice(0, -5); // strip ".json"

    const newDevice: DeviceConfig = {
      ...template,
      id,
      name,
      template: false,
      templateId,
      connection: { ...template.connection, slaveId },
    };

    fs.writeFileSync(filePath, JSON.stringify(newDevice, null, 2), 'utf-8');
    return newDevice;
  }

  updateDevice(id: string, patch: { name?: string; slaveId?: number; baudRate?: number; dataBits?: number; stopBits?: number; parity?: string }): DeviceConfig {
    const device = this.getById(id);
    if (!device) throw new NotFoundException(`Device '${id}' not found`);
    if (device.template) throw new BadRequestException('Cannot edit a template device');

    const filePath = Array.from(this.fileToId.entries()).find(([, v]) => v === id)?.[0];
    if (!filePath) throw new NotFoundException(`File for device '${id}' not found`);

    const updated: DeviceConfig = {
      ...device,
      ...(patch.name !== undefined && { name: patch.name }),
      connection: {
        ...device.connection,
        ...(patch.slaveId  !== undefined && { slaveId:  patch.slaveId }),
        ...(patch.baudRate !== undefined && { baudRate: patch.baudRate }),
        ...(patch.dataBits !== undefined && { dataBits: patch.dataBits }),
        ...(patch.stopBits !== undefined && { stopBits: patch.stopBits }),
        ...(patch.parity   !== undefined && { parity:   patch.parity }),
      },
    };

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  deleteDevice(id: string): void {
    const device = this.getById(id);
    if (!device) throw new NotFoundException(`Device '${id}' not found`);
    if (device.template) throw new BadRequestException('Cannot delete a template device');

    const filePath = Array.from(this.fileToId.entries()).find(([, v]) => v === id)?.[0];
    if (!filePath) throw new NotFoundException(`File for device '${id}' not found`);
    fs.unlinkSync(filePath);
  }
}
