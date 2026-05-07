import { Injectable, Logger } from '@nestjs/common';
import { OlaConfig, OlaUniverse, OlaDevice, DmxChannels } from './ola.types';

@Injectable()
export class OlaService {
  private readonly logger = new Logger(OlaService.name);

  private config: OlaConfig = {
    host: process.env.OLA_HOST ?? 'localhost',
    port: Number(process.env.OLA_PORT ?? 9090),
  };

  private get baseUrl() {
    return `http://${this.config.host}:${this.config.port}`;
  }

  // ─── Утилиты ───────────────────────────────────────────────────────────────

  configure(config: Partial<OlaConfig>) {
    this.config = { ...this.config, ...config };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/json/universe_plugin_list`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getConfig(): OlaConfig {
    return { ...this.config };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`OLA HTTP ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  private async post(path: string, body: Record<string, string>): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`OLA HTTP ${res.status}: ${path}`);
  }

  // ─── Universe ──────────────────────────────────────────────────────────────

  async getUniverses(): Promise<OlaUniverse[]> {
    const data = await this.get<{ universes: OlaUniverse[] }>('/json/universe_plugin_list');
    return data.universes ?? [];
  }

  async getUniverse(universeId: number): Promise<OlaUniverse> {
    const data = await this.get<OlaUniverse>(`/json/universe_info?id=${universeId}`);
    return data;
  }

  // ─── DMX ───────────────────────────────────────────────────────────────────

  /**
   * Отправить DMX значения в universe.
   * channels — массив до 512 элементов (0-255).
   * Неуказанные каналы остаются без изменений.
   */
  async setDmx(universeId: number, channels: DmxChannels): Promise<void> {
    await this.post('/set_dmx', {
      u: String(universeId),
      d: channels.join(','),
    });
  }

  /**
   * Прочитать текущие DMX значения из universe.
   * Возвращает массив из 512 байт (каналы 1-512).
   */
  async getDmx(universeId: number): Promise<DmxChannels> {
    const data = await this.get<{ dmx: number[] }>(`/get_dmx?u=${universeId}`);
    return data.dmx ?? new Array(512).fill(0);
  }

  /**
   * Установить один канал.
   */
  async setChannel(universeId: number, channel: number, value: number): Promise<void> {
    // OLA не поддерживает partial update — читаем текущее и обновляем нужный канал
    const current = await this.getDmx(universeId);
    current[channel - 1] = Math.max(0, Math.min(255, value));
    await this.setDmx(universeId, current);
  }

  /**
   * Установить диапазон каналов (удобно для RGB и т.п.).
   * startChannel — первый канал (1-based), values — значения.
   */
  async setChannels(
    universeId: number,
    startChannel: number,
    values: number[],
  ): Promise<void> {
    const current = await this.getDmx(universeId);
    for (let i = 0; i < values.length; i++) {
      const idx = startChannel - 1 + i;
      if (idx < 512) current[idx] = Math.max(0, Math.min(255, values[i]));
    }
    await this.setDmx(universeId, current);
  }

  /**
   * Fade: плавно изменить каналы за N миллисекунд.
   */
  async fade(
    universeId: number,
    target: DmxChannels,
    durationMs: number,
    steps = 20,
  ): Promise<void> {
    const current = await this.getDmx(universeId);
    const stepMs = durationMs / steps;

    for (let step = 1; step <= steps; step++) {
      const frame = current.map((from, i) => {
        const to = target[i] ?? from;
        return Math.round(from + (to - from) * (step / steps));
      });
      await this.setDmx(universeId, frame);
      await new Promise(r => setTimeout(r, stepMs));
    }
  }

  // ─── RDM — Device Discovery ────────────────────────────────────────────────

  /**
   * Обнаружить все RDM устройства в universe.
   * Возвращает массив UID вида '0102:00000001'.
   */
  async discoverDevices(universeId: number): Promise<string[]> {
    const data = await this.get<{ uids: string[] }>(
      `/json/rdm/uids?id=${universeId}`,
    );
    return data.uids ?? [];
  }

  /**
   * Полная информация об устройстве (модель, производитель, адрес и т.д.).
   */
  async getDeviceInfo(universeId: number, uid: string): Promise<OlaDevice> {
    const data = await this.get<OlaDevice>(
      `/json/rdm/uid_info?id=${universeId}&uid=${uid}`,
    );
    return data;
  }

  /**
   * Получить информацию по всем найденным устройствам сразу.
   */
  async getAllDevicesInfo(universeId: number): Promise<OlaDevice[]> {
    const uids = await this.discoverDevices(universeId);
    const results: OlaDevice[] = [];
    for (const uid of uids) {
      try {
        const info = await this.getDeviceInfo(universeId, uid);
        results.push(info);
      } catch (e) {
        this.logger.warn(`Не удалось прочитать данные ${uid}: ${(e as Error).message}`);
      }
    }
    return results;
  }

  // ─── RDM — Parameters ──────────────────────────────────────────────────────

  /**
   * Прочитать параметр устройства (GET PID).
   * pid — например: 'DEVICE_TEMPERATURE', 'DMX_START_ADDRESS', 'LAMP_HOURS'
   */
  async getParameter(universeId: number, uid: string, pid: string): Promise<any> {
    const data = await this.get(
      `/json/rdm/uid_info?id=${universeId}&uid=${uid}&pid=${pid}`,
    );
    return data;
  }

  /**
   * Записать параметр устройства (SET PID).
   */
  async setParameter(
    universeId: number,
    uid: string,
    pid: string,
    value: Record<string, any>,
  ): Promise<void> {
    const body: Record<string, string> = {
      id: String(universeId),
      uid,
      pid,
      ...Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)])),
    };
    await this.post('/rdm/set_param', body);
  }

  /**
   * Список поддерживаемых PIDs устройства.
   */
  async getSupportedParameters(universeId: number, uid: string): Promise<string[]> {
    const data = await this.get<{ pids: string[] }>(
      `/json/rdm/supported_pids?id=${universeId}&uid=${uid}`,
    );
    return data.pids ?? [];
  }

  // ─── Удобные обёртки для частых операций ──────────────────────────────────

  async getDeviceTemperature(universeId: number, uid: string): Promise<number | null> {
    try {
      const data = await this.getParameter(universeId, uid, 'DEVICE_TEMPERATURE');
      return data.temperature ?? null;
    } catch {
      return null;
    }
  }

  async getLampHours(universeId: number, uid: string): Promise<number | null> {
    try {
      const data = await this.getParameter(universeId, uid, 'LAMP_HOURS');
      return data.lamp_hours ?? null;
    } catch {
      return null;
    }
  }

  async getDmxStartAddress(universeId: number, uid: string): Promise<number | null> {
    try {
      const data = await this.getParameter(universeId, uid, 'DMX_START_ADDRESS');
      return data.dmx_start_address ?? null;
    } catch {
      return null;
    }
  }

  async setDmxStartAddress(
    universeId: number,
    uid: string,
    address: number,
  ): Promise<void> {
    await this.setParameter(universeId, uid, 'DMX_START_ADDRESS', {
      dmx_start_address: address,
    });
  }

  async identify(universeId: number, uid: string, on: boolean): Promise<void> {
    await this.setParameter(universeId, uid, 'IDENTIFY_DEVICE', { identify: on ? 1 : 0 });
  }
}
