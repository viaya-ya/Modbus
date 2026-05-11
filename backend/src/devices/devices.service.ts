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

  constructor() {
    this.devicesPath = path.join(process.cwd(), '..', 'devices');
  }

  async onModuleInit() {
    this.loadAll();
    await this.startWatcher();
  }

  onModuleDestroy() {
    this.watcher?.close();
  }

  private loadAll() {
    if (!fs.existsSync(this.devicesPath)) return;
    const files = fs.readdirSync(this.devicesPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      this.loadFile(path.join(this.devicesPath, file));
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
    this.watcher = chokidar.watch(this.devicesPath, {
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

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `${slug}-${Date.now()}`;
    const fileName = `${id}.json`;
    const filePath = path.join(this.devicesPath, fileName);

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

  deleteDevice(id: string): void {
    const device = this.getById(id);
    if (!device) throw new NotFoundException(`Device '${id}' not found`);
    if (device.template) throw new BadRequestException('Cannot delete a template device');

    const filePath = Array.from(this.fileToId.entries()).find(([, v]) => v === id)?.[0];
    if (!filePath) throw new NotFoundException(`File for device '${id}' not found`);
    fs.unlinkSync(filePath);
  }
}
