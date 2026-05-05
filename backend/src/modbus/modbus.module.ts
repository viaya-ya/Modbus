import { Module } from '@nestjs/common';
import { ModbusService } from './modbus.service';
import { ModbusController } from './modbus.controller';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  providers: [ModbusService],
  controllers: [ModbusController],
  exports: [ModbusService],
})
export class ModbusModule {}
