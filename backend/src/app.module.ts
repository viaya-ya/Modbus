import { Module } from '@nestjs/common';
import { DevicesModule } from './devices/devices.module';
import { ModbusModule } from './modbus/modbus.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [DevicesModule, ModbusModule, GatewayModule],
})
export class AppModule {}
