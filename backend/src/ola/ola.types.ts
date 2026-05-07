export interface OlaConfig {
  host: string;
  port: number;
}

export interface OlaUniverse {
  id: number;
  name: string;
  merge_mode: string;
  input_ports: number;
  output_ports: number;
}

export interface OlaDevice {
  uid: string;
  manufacturer_id: number;
  manufacturer: string;
  device_model: number;
  model: string;
  product_category: string;
  software_version: number;
  dmx_footprint: number;
  dmx_start_address: number;
  sub_device_count: number;
  sensor_count: number;
}

export interface OlaRdmParam {
  pid: string;
  [key: string]: any;
}

export type DmxChannels = number[]; // 512 элементов, значения 0-255
