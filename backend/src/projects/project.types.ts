import type { DeviceConnection } from '../devices/device.types';

export interface ProjectMeta {
  id: string;
  name: string;
  created: string;
}

export interface DeviceInstance {
  id: string;
  name: string;
  templateId: string;
  connection: Partial<DeviceConnection>;
}
