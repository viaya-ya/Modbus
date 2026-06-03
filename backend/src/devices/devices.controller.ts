import { Controller, Get, Post, Patch, Delete, Param, Body, NotFoundException, Res } from '@nestjs/common';
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

  @Get(':id/pending-writes')
  getPendingWrites(@Param('id') id: string) {
    return this.devicesService.getDevicePendingWrites(id);
  }

  @Patch(':id/pending-writes')
  updatePendingWrites(@Param('id') id: string, @Body() body: { pendingWrites: Record<string, any> }) {
    this.devicesService.updateDevicePendingWrites(id, body.pendingWrites);
    return { success: true };
  }

  @Get(':id/current-values')
  getCurrentValues(@Param('id') id: string) {
    return this.devicesService.getDeviceCurrentValues(id);
  }

  @Patch(':id/current-values')
  updateCurrentValues(@Param('id') id: string, @Body() body: { currentValues: Record<string, any> }) {
    this.devicesService.updateDeviceCurrentValues(id, body.currentValues);
    return { success: true };
  }

  @Post()
  create(@Body() body: { templateId: string; name: string; slaveId: number }) {
    return this.devicesService.createDevice(body.templateId, body.name, body.slaveId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; slaveId?: number; baudRate?: number; dataBits?: number; stopBits?: number; parity?: string }) {
    return this.devicesService.updateDevice(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.devicesService.deleteDevice(id);
    return { success: true };
  }
}
