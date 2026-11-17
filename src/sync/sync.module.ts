import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SyncCron } from './sync.cron.js';
import { SyncService } from './sync.service.js';

@Module({
  controllers: [SyncController],
  providers: [SyncService, SyncCron],
  exports: [SyncService],
})
export class SyncModule {}
