import { Module } from '@nestjs/common';
import { DevicesModule } from './devices/devices.module';
import { ModbusModule } from './modbus/modbus.module';
import { GatewayModule } from './gateway/gateway.module';
import { OlaModule } from './ola/ola.module';

@Module({
  imports: [DevicesModule, ModbusModule, GatewayModule, OlaModule],
})
export class AppModule {}
