import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { OlaService } from './ola.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class OlaGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OlaGateway.name);
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor(private readonly olaService: OlaService) {}

  handleConnection(client: Socket) {
    // При подключении браузера сразу сообщаем статус OLA
    this.olaService.isAvailable().then(available => {
      client.emit('ola:status', {
        available,
        config: this.olaService.getConfig(),
      });
    });
  }

  // ─── Конфигурация ──────────────────────────────────────────────────────────

  @SubscribeMessage('ola:configure')
  async handleConfigure(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { host?: string; port?: number },
  ) {
    this.olaService.configure(payload);
    const available = await this.olaService.isAvailable();
    this.server.emit('ola:status', { available, config: this.olaService.getConfig() });
    return { success: true, available };
  }

  @SubscribeMessage('ola:ping')
  async handlePing(@ConnectedSocket() client: Socket) {
    const available = await this.olaService.isAvailable();
    client.emit('ola:status', { available, config: this.olaService.getConfig() });
    return { available };
  }

  // ─── Universe ──────────────────────────────────────────────────────────────

  @SubscribeMessage('ola:universe:list')
  async handleUniverseList(@ConnectedSocket() client: Socket) {
    try {
      const universes = await this.olaService.getUniverses();
      client.emit('ola:universe:list', universes);
      return { success: true, universes };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  // ─── DMX ───────────────────────────────────────────────────────────────────

  @SubscribeMessage('ola:dmx:set')
  async handleDmxSet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; channels: number[] },
  ) {
    try {
      await this.olaService.setDmx(payload.universeId, payload.channels);
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:dmx:set-channel')
  async handleDmxSetChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; channel: number; value: number },
  ) {
    try {
      await this.olaService.setChannel(payload.universeId, payload.channel, payload.value);
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:dmx:set-channels')
  async handleDmxSetChannels(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; startChannel: number; values: number[] },
  ) {
    try {
      await this.olaService.setChannels(
        payload.universeId,
        payload.startChannel,
        payload.values,
      );
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:dmx:get')
  async handleDmxGet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number },
  ) {
    try {
      const channels = await this.olaService.getDmx(payload.universeId);
      client.emit('ola:dmx:data', { universeId: payload.universeId, channels });
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:dmx:fade')
  async handleDmxFade(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; channels: number[]; durationMs: number },
  ) {
    try {
      await this.olaService.fade(
        payload.universeId,
        payload.channels,
        payload.durationMs,
      );
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  // ─── DMX Монитор (периодический опрос) ────────────────────────────────────

  @SubscribeMessage('ola:monitor:start')
  handleMonitorStart(
    @MessageBody() payload: { universeId: number; intervalMs?: number },
  ) {
    this.stopMonitor();
    const interval = payload.intervalMs ?? 1000;

    this.monitorTimer = setInterval(async () => {
      try {
        const channels = await this.olaService.getDmx(payload.universeId);
        this.server.emit('ola:dmx:data', {
          universeId: payload.universeId,
          channels,
          timestamp: Date.now(),
        });
      } catch (e) {
        this.logger.warn(`Monitor error: ${(e as Error).message}`);
      }
    }, interval);

    return { success: true };
  }

  @SubscribeMessage('ola:monitor:stop')
  handleMonitorStop() {
    this.stopMonitor();
    return { success: true };
  }

  private stopMonitor() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  // ─── RDM — Discovery ───────────────────────────────────────────────────────

  @SubscribeMessage('ola:rdm:discover')
  async handleRdmDiscover(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; withInfo?: boolean },
  ) {
    try {
      if (payload.withInfo) {
        // Возвращает полную информацию по каждому устройству
        const devices = await this.olaService.getAllDevicesInfo(payload.universeId);
        client.emit('ola:rdm:devices', { universeId: payload.universeId, devices });
        return { success: true, count: devices.length };
      } else {
        // Только UIDs — быстрее
        const uids = await this.olaService.discoverDevices(payload.universeId);
        client.emit('ola:rdm:uids', { universeId: payload.universeId, uids });
        return { success: true, count: uids.length };
      }
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:rdm:device-info')
  async handleRdmDeviceInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; uid: string },
  ) {
    try {
      const device = await this.olaService.getDeviceInfo(payload.universeId, payload.uid);
      client.emit('ola:rdm:device-info', { uid: payload.uid, device });
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  // ─── RDM — Parameters ──────────────────────────────────────────────────────

  @SubscribeMessage('ola:rdm:get')
  async handleRdmGet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; uid: string; pid: string },
  ) {
    try {
      const data = await this.olaService.getParameter(
        payload.universeId,
        payload.uid,
        payload.pid,
      );
      client.emit('ola:rdm:param', { uid: payload.uid, pid: payload.pid, data });
      return { success: true, data };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:rdm:set')
  async handleRdmSet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      universeId: number;
      uid: string;
      pid: string;
      value: Record<string, any>;
    },
  ) {
    try {
      await this.olaService.setParameter(
        payload.universeId,
        payload.uid,
        payload.pid,
        payload.value,
      );
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  @SubscribeMessage('ola:rdm:identify')
  async handleRdmIdentify(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { universeId: number; uid: string; on: boolean },
  ) {
    try {
      await this.olaService.identify(payload.universeId, payload.uid, payload.on);
      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }

  // ─── RDM — Мониторинг состояния светильников ───────────────────────────────

  @SubscribeMessage('ola:rdm:poll')
  async handleRdmPoll(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      universeId: number;
      expectedUids: string[];  // список UIDs которые должны быть онлайн
    },
  ) {
    try {
      const foundUids = await this.olaService.discoverDevices(payload.universeId);
      const foundSet = new Set(foundUids);

      const status = payload.expectedUids.map(uid => ({
        uid,
        online: foundSet.has(uid),
      }));

      // Дополнительно собираем температуру для онлайн-устройств
      const withDetails = await Promise.all(
        status.map(async s => {
          if (!s.online) return s;
          const [temperature, lampHours, dmxAddress] = await Promise.allSettled([
            this.olaService.getDeviceTemperature(payload.universeId, s.uid),
            this.olaService.getLampHours(payload.universeId, s.uid),
            this.olaService.getDmxStartAddress(payload.universeId, s.uid),
          ]);
          return {
            ...s,
            temperature: temperature.status === 'fulfilled' ? temperature.value : null,
            lampHours: lampHours.status === 'fulfilled' ? lampHours.value : null,
            dmxAddress: dmxAddress.status === 'fulfilled' ? dmxAddress.value : null,
          };
        }),
      );

      client.emit('ola:rdm:status', {
        universeId: payload.universeId,
        timestamp: new Date().toISOString(),
        devices: withDetails,
        online: withDetails.filter(d => d.online).length,
        offline: withDetails.filter(d => !d.online).length,
      });

      return { success: true };
    } catch (e) {
      client.emit('ola:error', { message: (e as Error).message });
      return { success: false };
    }
  }
}
