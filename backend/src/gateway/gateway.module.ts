import { Module } from '@nestjs/common';
import { ModbusGateway } from './modbus.gateway';
import { DevicesModule } from '../devices/devices.module';
import { ModbusModule } from '../modbus/modbus.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [DevicesModule, ModbusModule, ProjectsModule],
  providers: [ModbusGateway],
})
export class GatewayModule {}
