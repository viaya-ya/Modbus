import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface DeviceUISettings {
  monitorOrder?: string[];
  monitorVisible?: string[];
  groupOrder?: string[];
  paramColWidths?: Record<string, number>;
}

export interface AppSettings {
  activeProject: string | null;
  siderSide: 'left' | 'right';
  deviceSettings?: Record<string, DeviceUISettings>;
}

const DEFAULTS: AppSettings = { activeProject: null, siderSide: 'left', deviceSettings: {} };

@Injectable()
export class SettingsService {
  private readonly filePath: string;
  private settings: AppSettings;

  constructor() {
    this.filePath = path.join(process.cwd(), '..', 'settings.json');
    this.settings = this.load();
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) };
      }
    } catch {}
    return { ...DEFAULTS };
  }

  get(): AppSettings {
      return this.settings;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch };
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
    return this.settings;
  }

  updateDeviceSettings(deviceId: string, patch: Partial<DeviceUISettings>): AppSettings {
    const current = this.load();
    const updated: AppSettings = {
      ...current,
      deviceSettings: {
        ...(current.deviceSettings ?? {}),
        [deviceId]: { ...(current.deviceSettings?.[deviceId] ?? {}), ...patch },
      },
    };
    this.settings = updated;
    fs.writeFileSync(this.filePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }
}
