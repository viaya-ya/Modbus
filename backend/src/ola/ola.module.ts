import { Module } from '@nestjs/common';
import { OlaService } from './ola.service';
import { OlaGateway } from './ola.gateway';
import { OlaController } from './ola.controller';

@Module({
  providers: [OlaService, OlaGateway],
  controllers: [OlaController],
  exports: [OlaService],
})
export class OlaModule {}
