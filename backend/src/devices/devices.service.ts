import { Injectable, OnModuleInit, OnModuleDestroy, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import { DeviceConfig, DeviceParam } from './device.types';
import { ProjectsService } from '../projects/projects.service';
import { DeviceInstance } from '../projects/project.types';

@Injectable()
export class DevicesService implements OnModuleInit, OnModuleDestroy {
  readonly events = new EventEmitter();

  private templates = new Map<string, DeviceConfig>();
  private templateFileToId = new Map<string, string>();

  private instances = new Map<string, DeviceInstance>();
  private instanceFileToId = new Map<string, string>();

  private templateWatcher: FSWatcher | null = null;
  private instanceWatcher: FSWatcher | null = null;

  readonly devicesPath: string;
  readonly templatesPath: string;

  constructor(private readonly projectsService: ProjectsService) {
    this.devicesPath = path.join(process.cwd(), '..', 'devices');
    this.templatesPath = path.join(this.devicesPath, 'templates');
  }

  async onModuleInit() {
    fs.mkdirSync(this.templatesPath, { recursive: true });
    this.loadAllTemplates();
    await this.startTemplateWatcher();
    this.loadActiveProjectInstances();
    await this.startInstanceWatcher();
    this.projectsService.events.on('project:changed', async () => {
      await this.reloadProject();
    });
  }

  onModuleDestroy() {
    this.templateWatcher?.close();
    this.instanceWatcher?.close();
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  private loadAllTemplates() {
    if (!fs.existsSync(this.templatesPath)) return;
    for (const file of fs.readdirSync(this.templatesPath).filter(f => f.endsWith('.json'))) {
      this.loadTemplateFile(path.join(this.templatesPath, file));
    }
  }

  private loadTemplateFile(filePath: string): DeviceConfig | null {
    try {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DeviceConfig;
      const prevId = this.templateFileToId.get(filePath);
      if (prevId && prevId !== config.id) this.templates.delete(prevId);
      this.templateFileToId.set(filePath, config.id);
      this.templates.set(config.id, { ...config, template: true });
      return config;
    } catch {
      return null;
    }
  }

  private async startTemplateWatcher() {
    const chokidar = await import('chokidar');
    this.templateWatcher = chokidar.watch(this.templatesPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });
    this.templateWatcher.on('add', (fp: string) => {
      if (!fp.endsWith('.json')) return;
      const c = this.loadTemplateFile(fp);
      if (c) this.events.emit('device:added', c);
    });
    this.templateWatcher.on('change', (fp: string) => {
      if (!fp.endsWith('.json')) return;
      const c = this.loadTemplateFile(fp);
      if (c) this.events.emit('device:changed', c);
    });
    this.templateWatcher.on('unlink', (fp: string) => {
      const id = this.templateFileToId.get(fp);
      if (id) {
        this.templates.delete(id);
        this.templateFileToId.delete(fp);
        this.events.emit('device:removed', id);
      }
    });
  }

  // ─── Instances ─────────────────────────────────────────────────────────────

  private loadActiveProjectInstances() {
    this.instances.clear();
    this.instanceFileToId.clear();
    const projectId = this.projectsService.getActiveProjectId();
    if (!projectId) return;
    for (const { instance, filePath } of this.projectsService.loadInstances(projectId)) {
      this.instances.set(instance.id, instance);
      this.instanceFileToId.set(filePath, instance.id);
    }
  }

  private async startInstanceWatcher() {
    this.instanceWatcher?.close();
    this.instanceWatcher = null;
    const projectPath = this.projectsService.getActiveProjectPath();
    if (!projectPath) return;
    const chokidar = await import('chokidar');
    this.instanceWatcher = chokidar.watch(projectPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });
    this.instanceWatcher.on('add', (fp: string) => {
      if (!fp.endsWith('.json') || fp.endsWith('project.json')) return;
      this.loadInstanceFile(fp, 'added');
    });
    this.instanceWatcher.on('change', (fp: string) => {
      if (!fp.endsWith('.json') || fp.endsWith('project.json')) return;
      this.loadInstanceFile(fp, 'changed');
    });
    this.instanceWatcher.on('unlink', (fp: string) => {
      const id = this.instanceFileToId.get(fp);
      if (id) {
        this.instances.delete(id);
        this.instanceFileToId.delete(fp);
        this.events.emit('device:removed', id);
      }
    });
  }

  private loadInstanceFile(filePath: string, event: 'added' | 'changed') {
    try {
      const instance = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DeviceInstance;
      const prevId = this.instanceFileToId.get(filePath);
      if (prevId && prevId !== instance.id) this.instances.delete(prevId);
      this.instanceFileToId.set(filePath, instance.id);
      this.instances.set(instance.id, instance);
      const merged = this.merge(instance);
      if (merged) this.events.emit(`device:${event}`, merged);
    } catch {}
  }

  private async reloadProject() {
    this.instanceWatcher?.close();
    this.instanceWatcher = null;
    this.loadActiveProjectInstances();
    await this.startInstanceWatcher();
    this.events.emit('devices:reloaded');
  }

  // ─── Merge ─────────────────────────────────────────────────────────────────

  private merge(instance: DeviceInstance): DeviceConfig | null {
    const template = this.templates.get(instance.templateId);
    if (!template) return null;
    return {
      ...template,
      id: instance.id,
      name: instance.name,
      template: false,
      templateId: instance.templateId,
      connection: { ...template.connection, ...instance.connection },
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getAll(): DeviceConfig[] {
    const result: DeviceConfig[] = [];
    for (const t of this.templates.values()) result.push(t);
    for (const inst of this.instances.values()) {
      const merged = this.merge(inst);
      if (merged) result.push(merged);
    }
    return result;
  }

  getById(id: string): DeviceConfig | null {
    const inst = this.instances.get(id);
    if (inst) return this.merge(inst);
    return this.templates.get(id) ?? null;
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
    return Array.from(this.templates.values());
  }

  createDevice(templateId: string, name: string, slaveId: number): DeviceConfig {
    const template = this.templates.get(templateId);
    if (!template) throw new NotFoundException(`Шаблон '${templateId}' не найден`);

    const projectId = this.projectsService.getActiveProjectId();
    if (!projectId) throw new BadRequestException('Нет активного проекта. Создайте или выберите проект.');

    const baseName = name.trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') || `device_${Date.now()}`;
    let id = baseName;
    let counter = 2;
    while (this.instances.has(id)) {
      id = `${baseName}_${counter++}`;
    }

    const instance: DeviceInstance = {
      id,
      name,
      templateId,
      connection: { slaveId },
    };

    this.projectsService.writeInstance(projectId, instance);
    return this.merge(instance)!;
  }

  updateDevice(id: string, patch: { name?: string; slaveId?: number; baudRate?: number; dataBits?: number; stopBits?: number; parity?: string }): DeviceConfig {
    const instance = this.instances.get(id);
    if (!instance) {
      if (this.templates.has(id)) throw new BadRequestException('Нельзя редактировать шаблон');
      throw new NotFoundException(`Устройство '${id}' не найдено`);
    }

    const filePath = Array.from(this.instanceFileToId.entries()).find(([, v]) => v === id)?.[0];
    if (!filePath) throw new NotFoundException(`Файл устройства '${id}' не найден`);

    // Generate new id/filename from new name if name is changing
    let newId = id;
    if (patch.name !== undefined) {
      const base = patch.name.trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') || id;
      newId = base;
      let counter = 2;
      while (newId !== id && this.instances.has(newId)) {
        newId = `${base}_${counter++}`;
      }
    }

    const updated: DeviceInstance = {
      ...instance,
      id: newId,
      ...(patch.name !== undefined && { name: patch.name }),
      connection: {
        ...instance.connection,
        ...(patch.slaveId  !== undefined && { slaveId:  patch.slaveId }),
        ...(patch.baudRate !== undefined && { baudRate: patch.baudRate }),
        ...(patch.dataBits !== undefined && { dataBits: patch.dataBits }),
        ...(patch.stopBits !== undefined && { stopBits: patch.stopBits }),
        ...(patch.parity   !== undefined && { parity:   patch.parity }),
      },
    };

    if (newId !== id) {
      const newFilePath = path.join(path.dirname(filePath), `${newId}.json`);
      if (fs.existsSync(newFilePath)) throw new BadRequestException(`Файл '${newId}.json' уже существует`);
      // Update maps before file ops so chokidar events for old/new paths are handled correctly
      this.instances.delete(id);
      this.instances.set(newId, updated);
      this.instanceFileToId.delete(filePath);
      this.instanceFileToId.set(newFilePath, newId);
      fs.renameSync(filePath, newFilePath);
      fs.writeFileSync(newFilePath, JSON.stringify(updated, null, 2), 'utf-8');
      this.events.emit('device:id:changed', { oldId: id, newId });
    } else {
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    }

    return this.merge(updated)!;
  }

  deleteDevice(id: string): void {
    if (this.templates.has(id)) throw new BadRequestException('Нельзя удалить шаблон');
    const filePath = Array.from(this.instanceFileToId.entries()).find(([, v]) => v === id)?.[0];
    if (!filePath) throw new NotFoundException(`Устройство '${id}' не найдено`);
    this.projectsService.deleteInstanceFile(filePath);
  }
}
