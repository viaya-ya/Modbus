import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  getAll() {
    return this.devicesService.getAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    const device = this.devicesService.getById(id);
    if (!device) throw new NotFoundException(`Device '${id}' not found`);
    return device;
  }
}
