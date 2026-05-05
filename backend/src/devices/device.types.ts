export interface ParamOption {
  value: number;
  label: string;
}

export interface DeviceParam {
  id: string;
  name: string;
  register: number;
  access: 'read' | 'read-write';
  type: 'float' | 'int' | 'enum';
  scale?: number;
  unit?: string;
  min?: number;
  max?: number;
  default?: number;
  options?: ParamOption[];
}

export interface ParamGroup {
  id: string;
  name: string;
  description?: string;
  params: DeviceParam[];
}

export interface DeviceConnection {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  protocol: string;
}

export interface DeviceConfig {
  id: string;
  name: string;
  description?: string;
  connection: DeviceConnection;
  groups: ParamGroup[];
}
