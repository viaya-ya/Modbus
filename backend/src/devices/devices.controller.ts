import { Controller, Get, Param, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DevicesService } from './devices.service';
import * as fs from 'fs';
import * as path from 'path';

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

  @Get('images/:filename')
  getImage(@Param('filename') filename: string, @Res() res: Response) {
    const safeName = path.basename(filename);
    const filePath = path.join(this.devicesService.devicesPath, 'images', safeName);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Image not found');
    res.sendFile(filePath);
  }
}
