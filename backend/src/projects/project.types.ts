import type { DeviceConnection } from '../devices/device.types';

export interface ProjectMeta {
  id: string;
  name: string;
  created: string;
}

export interface DeviceNote {
  id: string;
  createdAt: string;
  text: string;
}

export interface DeviceInstance {
  id: string;
  name: string;
  templateId: string;
  connection: Partial<DeviceConnection>;
  pendingWrites?: Record<string, any>;
  currentValues?: Record<string, any>;
  notes?: DeviceNote[];
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
