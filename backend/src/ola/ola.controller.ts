import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { OlaService } from './ola.service';

@Controller('ola')
export class OlaController {
  constructor(private readonly olaService: OlaService) {}

  private async checkAvailable() {
    const ok = await this.olaService.isAvailable();
    if (!ok) throw new ServiceUnavailableException('OLA недоступна');
  }

  // ─── Статус ────────────────────────────────────────────────────────────────

  @Get('status')
  async getStatus() {
    const available = await this.olaService.isAvailable();
    return { available, config: this.olaService.getConfig() };
  }

  @Post('configure')
  configure(@Body() body: { host?: string; port?: number }) {
    this.olaService.configure(body);
    return { success: true, config: this.olaService.getConfig() };
  }

  // ─── Universe ──────────────────────────────────────────────────────────────

  @Get('universes')
  async getUniverses() {
    await this.checkAvailable();
    return this.olaService.getUniverses();
  }

  @Get('universes/:id')
  async getUniverse(@Param('id', ParseIntPipe) id: number) {
    await this.checkAvailable();
    return this.olaService.getUniverse(id);
  }

  // ─── DMX ───────────────────────────────────────────────────────────────────

  @Get('dmx/:universeId')
  async getDmx(@Param('universeId', ParseIntPipe) universeId: number) {
    await this.checkAvailable();
    const channels = await this.olaService.getDmx(universeId);
    return { universeId, channels };
  }

  @Post('dmx/:universeId')
  async setDmx(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Body() body: { channels: number[] },
  ) {
    await this.checkAvailable();
    if (!body.channels?.length) throw new BadRequestException('channels is required');
    await this.olaService.setDmx(universeId, body.channels);
    return { success: true };
  }

  @Post('dmx/:universeId/channel/:channel')
  async setChannel(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Param('channel', ParseIntPipe) channel: number,
    @Body() body: { value: number },
  ) {
    await this.checkAvailable();
    await this.olaService.setChannel(universeId, channel, body.value);
    return { success: true };
  }

  @Post('dmx/:universeId/fade')
  async fade(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Body() body: { channels: number[]; durationMs: number },
  ) {
    await this.checkAvailable();
    await this.olaService.fade(universeId, body.channels, body.durationMs);
    return { success: true };
  }

  // ─── RDM — Discovery ───────────────────────────────────────────────────────

  @Get('rdm/:universeId/devices')
  async discoverDevices(@Param('universeId', ParseIntPipe) universeId: number) {
    await this.checkAvailable();
    const uids = await this.olaService.discoverDevices(universeId);
    return { universeId, uids, count: uids.length };
  }

  @Get('rdm/:universeId/devices/info')
  async getAllDevicesInfo(@Param('universeId', ParseIntPipe) universeId: number) {
    await this.checkAvailable();
    const devices = await this.olaService.getAllDevicesInfo(universeId);
    return { universeId, devices, count: devices.length };
  }

  @Get('rdm/:universeId/device/:uid')
  async getDeviceInfo(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Param('uid') uid: string,
  ) {
    await this.checkAvailable();
    return this.olaService.getDeviceInfo(universeId, uid);
  }

  // ─── RDM — Parameters ──────────────────────────────────────────────────────

  @Get('rdm/:universeId/device/:uid/pids')
  async getSupportedPids(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Param('uid') uid: string,
  ) {
    await this.checkAvailable();
    const pids = await this.olaService.getSupportedParameters(universeId, uid);
    return { uid, pids };
  }

  @Get('rdm/:universeId/device/:uid/param/:pid')
  async getParameter(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Param('uid') uid: string,
    @Param('pid') pid: string,
  ) {
    await this.checkAvailable();
    return this.olaService.getParameter(universeId, uid, pid);
  }

  @Post('rdm/:universeId/device/:uid/param/:pid')
  async setParameter(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Param('uid') uid: string,
    @Param('pid') pid: string,
    @Body() value: Record<string, any>,
  ) {
    await this.checkAvailable();
    await this.olaService.setParameter(universeId, uid, pid, value);
    return { success: true };
  }

  @Post('rdm/:universeId/device/:uid/identify')
  async identify(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Param('uid') uid: string,
    @Body() body: { on: boolean },
  ) {
    await this.checkAvailable();
    await this.olaService.identify(universeId, uid, body.on);
    return { success: true };
  }

  // ─── RDM — Мониторинг статуса светильников ─────────────────────────────────

  @Post('rdm/:universeId/poll')
  async pollDevices(
    @Param('universeId', ParseIntPipe) universeId: number,
    @Body() body: { expectedUids: string[] },
  ) {
    await this.checkAvailable();
    const foundUids = await this.olaService.discoverDevices(universeId);
    const foundSet = new Set(foundUids);

    const devices = await Promise.all(
      body.expectedUids.map(async uid => {
        const online = foundSet.has(uid);
        if (!online) return { uid, online };
        const [temperature, lampHours, dmxAddress] = await Promise.allSettled([
          this.olaService.getDeviceTemperature(universeId, uid),
          this.olaService.getLampHours(universeId, uid),
          this.olaService.getDmxStartAddress(universeId, uid),
        ]);
        return {
          uid,
          online,
          temperature: temperature.status === 'fulfilled' ? temperature.value : null,
          lampHours: lampHours.status === 'fulfilled' ? lampHours.value : null,
          dmxAddress: dmxAddress.status === 'fulfilled' ? dmxAddress.value : null,
        };
      }),
    );

    return {
      universeId,
      timestamp: new Date().toISOString(),
      devices,
      online: devices.filter(d => d.online).length,
      offline: devices.filter(d => !d.online).length,
    };
  }
}
