import { Controller, Get, Post, Delete, Param, Body, NotFoundException, Res } from '@nestjs/common';
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

  @Get('templates')
  getTemplates() {
    return this.devicesService.getTemplates();
  }

  @Get('images/:filename')
  getImage(@Param('filename') filename: string, @Res() res: Response) {
    const safeName = path.basename(filename);
    const filePath = path.join(this.devicesService.devicesPath, 'images', safeName);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Image not found');
    res.sendFile(filePath);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    const device = this.devicesService.getById(id);
    if (!device) throw new NotFoundException(`Device '${id}' not found`);
    return device;
  }

  @Post()
  create(@Body() body: { templateId: string; name: string; slaveId: number }) {
    return this.devicesService.createDevice(body.templateId, body.name, body.slaveId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.devicesService.deleteDevice(id);
    return { success: true };
  }
}
