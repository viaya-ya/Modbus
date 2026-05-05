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

@WebSocketGateway({ cors: { origin: '*' } })
export class ModbusGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly devicesService: DevicesService,
    private readonly modbusService: ModbusService,
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
  }

  afterInit(_server: Server) {}

  handleConnection(client: Socket) {
    client.emit('devices:list', this.devicesService.getAll());
    client.emit('modbus:status', this.modbusService.getStatus());
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('connect:port')
  async handleConnectPort(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { portPath: string; baudRate: number; slaveId: number },
  ) {
    try {
      await this.modbusService.connect(payload);
      this.server.emit('modbus:status', this.modbusService.getStatus());
      return { success: true };
    } catch (e) {
      client.emit('modbus:error', { message: (e as Error).message });
      return { success: false, error: (e as Error).message };
    }
  }

  @SubscribeMessage('disconnect:port')
  async handleDisconnectPort() {
    this.stopMonitor();
    await this.modbusService.disconnect();
    this.server.emit('modbus:status', this.modbusService.getStatus());
  }

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

    const f0 = device.groups.find(g => g.id === 'F0');
    let params = f0?.params ?? device.groups[0]?.params ?? [];
    if (paramIds?.length) {
      const allParams = device.groups.flatMap(g => g.params);
      params = allParams.filter(p => paramIds.includes(p.id));
    }

    this.monitorInterval = setInterval(async () => {
      if (!this.modbusService.isConnected()) return;

      const data: Record<string, any> = {};
      for (const param of params) {
        try {
          const rawValue = await this.modbusService.readRegister(param.register);
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
