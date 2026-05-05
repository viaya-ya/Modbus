import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import { DeviceConfig, DeviceParam } from './device.types';

@Injectable()
export class DevicesService implements OnModuleInit, OnModuleDestroy {
  readonly events = new EventEmitter();
  private devices = new Map<string, DeviceConfig>();
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
      for (const [id] of this.devices) {
        if (path.join(this.devicesPath, `${id}.json`) === filePath) {
          this.devices.delete(id);
          this.events.emit('device:removed', id);
          break;
        }
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
}
