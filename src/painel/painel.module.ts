import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module.js';
import { PainelController } from './painel.controller.js';
import { PainelService } from './painel.service.js';

@Module({
  imports: [ScopeModule],
  controllers: [PainelController],
  providers: [PainelService],
})
export class PainelModule {}
