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

export interface ProjectFile extends ProjectMeta {
  devices: DeviceInstance[];
}

export interface ProjectMismatch {
  folderId: string;     // actual folder name
  fileId: string;       // stem of the .project.json filename
  contentId: string;    // id field inside the file
  contentName: string;  // name field inside the file
}
