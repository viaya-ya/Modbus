import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsService } from '../settings/settings.service';
import { ProjectMeta, DeviceInstance } from './project.types';

@Injectable()
export class ProjectsService {
  readonly events = new EventEmitter();
  readonly projectsPath: string;

  constructor(private readonly settingsService: SettingsService) {
    this.projectsPath = path.join(process.cwd(), '..', 'projects');
    fs.mkdirSync(this.projectsPath, { recursive: true });
  }

  listProjects(): ProjectMeta[] {
    return fs.readdirSync(this.projectsPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(this.projectsPath, d.name, 'project.json'), 'utf-8'));
          return { id: d.name, name: raw.name ?? d.name, created: raw.created ?? '' };
        } catch {
          return { id: d.name, name: d.name, created: '' };
        }
      });
  }

  createProject(name: string): ProjectMeta {
    const id = name.trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') || `project_${Date.now()}`;
    const dir = path.join(this.projectsPath, id);
    if (fs.existsSync(dir)) throw new BadRequestException(`Проект '${id}' уже существует`);
    fs.mkdirSync(dir, { recursive: true });
    const meta: ProjectMeta = { id, name, created: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name, created: meta.created }, null, 2));
    return meta;
  }

  deleteProject(id: string): void {
    const dir = path.join(this.projectsPath, id);
    if (!fs.existsSync(dir)) throw new NotFoundException(`Проект '${id}' не найден`);
    fs.rmSync(dir, { recursive: true, force: true });
    if (this.getActiveProjectId() === id) {
      this.settingsService.update({ activeProject: null });
      this.events.emit('project:changed', null);
    }
  }

  getActiveProjectId(): string | null {
    return this.settingsService.get().activeProject;
  }

  getActiveProjectPath(): string | null {
    const id = this.getActiveProjectId();
    if (!id) return null;
    const dir = path.join(this.projectsPath, id);
    return fs.existsSync(dir) ? dir : null;
  }

  renameProject(id: string, name: string): ProjectMeta {
    const dir = path.join(this.projectsPath, id);
    if (!fs.existsSync(dir)) throw new NotFoundException(`Проект '${id}' не найден`);

    const newId = name.trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') || id;
    const newDir = path.join(this.projectsPath, newId);

    let existing: any = {};
    try { existing = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8')); } catch {}

    if (newId !== id) {
      if (fs.existsSync(newDir)) throw new BadRequestException(`Папка '${newId}' уже существует`);
      fs.renameSync(dir, newDir);
      if (this.getActiveProjectId() === id) {
        this.settingsService.update({ activeProject: newId });
        this.events.emit('project:changed', newId);
      }
    }

    fs.writeFileSync(path.join(newDir, 'project.json'), JSON.stringify({ ...existing, name }, null, 2));
    return { id: newId, name, created: existing.created ?? '' };
  }

  setActiveProject(id: string | null): void {
    if (id !== null) {
      const dir = path.join(this.projectsPath, id);
      if (!fs.existsSync(dir)) throw new NotFoundException(`Проект '${id}' не найден`);
    }
    this.settingsService.update({ activeProject: id });
    this.events.emit('project:changed', id);
  }

  // ─── Instance file helpers ─────────────────────────────────────────────────

  loadInstances(projectId: string): Array<{ instance: DeviceInstance; filePath: string }> {
    const dir = path.join(this.projectsPath, projectId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && f !== 'project.json')
      .flatMap(f => {
        try {
          const filePath = path.join(dir, f);
          const instance = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DeviceInstance;
          return [{ instance, filePath }];
        } catch {
          return [];
        }
      });
  }

  writeInstance(projectId: string, instance: DeviceInstance): string {
    const dir = path.join(this.projectsPath, projectId);
    const filePath = path.join(dir, `${instance.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(instance, null, 2), 'utf-8');
    return filePath;
  }

  deleteInstanceFile(filePath: string): void {
    fs.unlinkSync(filePath);
  }
}
