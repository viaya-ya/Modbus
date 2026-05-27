import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DevicesService } from '../devices/devices.service';
import { ModbusService } from '../modbus/modbus.service';
import { ProjectsService } from '../projects/projects.service';

const RECONNECT_INTERVAL_MS = 5000;

@WebSocketGateway({ cors: { origin: '*' } })
export class ModbusGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private monitorInterval: NodeJS.Timeout | null = null;
  private scanning = false;
  private scanCancelled = false;

  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;

  constructor(
    private readonly devicesService: DevicesService,
    private readonly modbusService: ModbusService,
    private readonly projectsService: ProjectsService,
  ) {}

  onModuleInit() {
    this.devicesService.events.on('device:added', () =>
      this.server?.emit('devices:updated', this.devicesService.getAll()),
    );
    this.devicesService.events.on('device:changed', () =>
      this.server?.emit('devices:updated', this.devicesService.getAll()),
    );
    this.devicesService.events.on('device:removed', () =>
      this.server?.emit('devices:updated', this.devicesService.getAll()),
    );
    this.devicesService.events.on('devices:reloaded', () => {
      this.stopMonitor();
      this.server?.emit('devices:updated', this.devicesService.getAll());
    });
    this.devicesService.events.on('device:id:changed', ({ oldId, newId }: { oldId: string; newId: string }) => {
      this.server?.emit('device:id:changed', { oldId, newId });
      this.server?.emit('devices:updated', this.devicesService.getAll());
    });

    this.modbusService.events.on('connection:lost', () => {
      this.stopMonitor();
      this.server?.emit('modbus:status', this.buildStatus());
      this.startReconnect();
    });

    this.projectsService.events.on('project:folder:mismatch', (mismatches) => {
      this.server?.emit('project:folder:mismatch', mismatches);
    });
    this.projectsService.events.on('projects:changed', () => {
      this.server?.emit('projects:updated', this.projectsService.listProjects());
    });
  }

  afterInit(_server: Server) {}

  handleConnection(client: Socket) {
    client.emit('devices:list', this.devicesService.getAll());
    client.emit('modbus:status', this.buildStatus());
    const mismatches = this.projectsService.checkMismatches();
    if (mismatches.length) client.emit('project:folder:mismatch', mismatches);
  }

  handleDisconnect(_client: Socket) {}

  // ─── Connection ────────────────────────────────────────────────────────────

  @SubscribeMessage('connect:port')
  async handleConnectPort(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { portPath: string; baudRate: number },
  ) {
    this.stopReconnect();
    try {
      await this.modbusService.connect(payload);
      this.server.emit('modbus:status', this.buildStatus());
      return { success: true };
    } catch (e) {
      client.emit('modbus:error', { message: (e as Error).message });
      return { success: false, error: (e as Error).message };
    }
  }

  @SubscribeMessage('disconnect:port')
  async handleDisconnectPort() {
    this.stopReconnect();
    this.stopMonitor();
    await this.modbusService.disconnect();
    this.server.emit('modbus:status', this.buildStatus());
  }

  // ─── Reconnect ─────────────────────────────────────────────────────────────

  private startReconnect() {
    this.stopReconnect();
    this.reconnectAttempt = 0;
    // First attempt immediately, then every RECONNECT_INTERVAL_MS
    this.tryReconnect();
    this.reconnectTimer = setInterval(() => this.tryReconnect(), RECONNECT_INTERVAL_MS);
  }

  private stopReconnect() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
  }

  private async tryReconnect() {
    if (!this.reconnectTimer && this.reconnectAttempt > 0) return; // was stopped
    const opts = this.modbusService.getStatus().options;
    if (!opts) { this.stopReconnect(); return; }

    this.reconnectAttempt++;
    this.server?.emit('modbus:status', this.buildStatus());

    try {
      await this.modbusService.connect(opts);
      this.stopReconnect();
      this.server?.emit('modbus:status', this.buildStatus());
    } catch {
      // next attempt scheduled by setInterval
    }
  }

  private buildStatus() {
    return {
      ...this.modbusService.getStatus(),
      reconnecting: this.reconnectTimer !== null,
      attempt: this.reconnectAttempt,
    };
  }

  // ─── Bus scan ──────────────────────────────────────────────────────────────

  @SubscribeMessage('bus:scan:start')
  async handleBusScanStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { from?: number; to?: number },
  ) {
    if (!this.modbusService.isConnected()) {
      client.emit('bus:scan:error', { message: 'Нет подключения к порту' });
      return;
    }
    if (this.scanning) {
      client.emit('bus:scan:error', { message: 'Сканирование уже запущено' });
      return;
    }

    this.stopMonitor();
    this.scanning = true;
    this.scanCancelled = false;

    const from = Math.max(1, payload.from ?? 1);
    const to   = Math.min(247, payload.to ?? 32);

    try {
      const found = await this.modbusService.scanBus(
        from, to,
        (addr, foundSoFar) => {
          client.emit('bus:scan:progress', {
            current: addr - from + 1,
            total: to - from + 1,
            scannedAddr: addr,
            found: foundSoFar,
          });
        },
        () => this.scanCancelled,
      );
      client.emit('bus:scan:done', { found });
    } catch (e) {
      client.emit('bus:scan:error', { message: (e as Error).message });
    } finally {
      this.scanning = false;
    }
  }

  @SubscribeMessage('bus:scan:cancel')
  handleBusScanCancel() {
    this.scanCancelled = true;
  }

  // ─── Monitor ───────────────────────────────────────────────────────────────

  @SubscribeMessage('monitor:start')
  handleMonitorStart(
    @MessageBody() payload: { deviceId: string; paramIds?: string[] },
  ) {
    this.startMonitor(payload.deviceId, payload.paramIds);
  }

  @SubscribeMessage('monitor:stop')
  handleMonitorStop() {
    this.stopMonitor();
  }

  private startMonitor(deviceId: string, paramIds?: string[]) {
    this.stopMonitor();

    const device = this.devicesService.getById(deviceId);
    if (!device) return;

    const f0 = device.groups.find(g => g.id === 'F0') ?? device.groups[0];
    let params = f0?.params ?? [];
    if (paramIds?.length) {
      const allParams = device.groups.flatMap(g => g.params);
      params = allParams.filter(p => paramIds.includes(p.id));
    }

    const slaveId = device.connection.slaveId ?? 1;

    this.monitorInterval = setInterval(async () => {
      if (!this.modbusService.isConnected()) return;

      const data: Record<string, any> = {};
      for (const param of params) {
        try {
          const rawValue = await this.modbusService.readRegister(param.register, slaveId);
          data[param.id] = {
            id: param.id,
            name: param.name,
            value: rawValue * (param.scale ?? 1),
            rawValue,
            unit: param.unit ?? '',
          };
        } catch (e) {
          data[param.id] = {
            id: param.id,
            name: param.name,
            error: (e as Error).message,
          };
        }
      }

      this.server.emit('monitor:data', { deviceId, data });
    }, 1000);
  }

  private stopMonitor() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
}
