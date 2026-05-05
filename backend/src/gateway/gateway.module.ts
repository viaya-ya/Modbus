import { Module } from '@nestjs/common';
import { ModbusGateway } from './modbus.gateway';
import { DevicesModule } from '../devices/devices.module';
import { ModbusModule } from '../modbus/modbus.module';

@Module({
  imports: [DevicesModule, ModbusModule],
  providers: [ModbusGateway],
})
export class GatewayModule {}
