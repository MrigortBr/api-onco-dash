import { Module } from '@nestjs/common';
import { RestritaGuard } from './restrita.guard.js';
import { ScopeController } from './scope.controller.js';

@Module({
  controllers: [ScopeController],
  providers: [RestritaGuard],
  exports: [RestritaGuard],
})
export class ScopeModule {}
