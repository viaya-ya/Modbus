import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ModbusService } from './modbus.service';
import { DevicesService } from '../devices/devices.service';

@Controller('modbus')
export class ModbusController {
  constructor(
    private readonly modbusService: ModbusService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get('status')
  getStatus() {
    return this.modbusService.getStatus();
  }

  @Post('connect')
  async connect(
    @Body() body: { portPath: string; baudRate?: number; slaveId?: number },
  ) {
    if (!body.portPath) throw new BadRequestException('portPath is required');
    await this.modbusService.connect({
      portPath: body.portPath,
      baudRate: body.baudRate ?? 9600,
      slaveId: body.slaveId ?? 1,
    });
    return { success: true };
  }

  @Post('disconnect')
  async disconnect() {
    await this.modbusService.disconnect();
    return { success: true };
  }

  @Post('read')
  async read(@Body() body: { deviceId: string; paramId: string }) {
    if (!this.modbusService.isConnected())
      throw new BadRequestException('Not connected to Modbus');
    const param = this.devicesService.findParam(body.deviceId, body.paramId);
    if (!param) throw new NotFoundException(`Param '${body.paramId}' not found`);
    const rawValue = await this.modbusService.readRegister(param.register);
    const scale = param.scale ?? 1;
    return {
      paramId: param.id,
      rawValue,
      value: rawValue * scale,
      unit: param.unit ?? '',
    };
  }

  @Post('write')
  async write(
    @Body() body: { deviceId: string; paramId: string; value: number },
  ) {
    if (!this.modbusService.isConnected())
      throw new BadRequestException('Not connected to Modbus');
    const param = this.devicesService.findParam(body.deviceId, body.paramId);
    if (!param) throw new NotFoundException(`Param '${body.paramId}' not found`);
    if (param.access !== 'read-write')
      throw new BadRequestException(`Param '${body.paramId}' is read-only`);
    const scale = param.scale ?? 1;
    await this.modbusService.writeRegister(param.register, Math.round(body.value / scale));
    return { success: true };
  }
}
