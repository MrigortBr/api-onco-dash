import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OncoThrottlerGuard } from './common/http/throttler.guard.js';
import { buildTypeOrmOptions } from './database/typeorm-options.js';
import { PainelModule } from './painel/painel.module.js';
import { ScopeModule } from './scope/scope.module.js';
import { SyncModule } from './sync/sync.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildTypeOrmOptions() }),
    // Limite geral de 1.000 requisições/min por IP (rede do órgão = muitos
    // usuários no mesmo IP). Login e senha: 5/min por IP + e-mail (@Throttle).
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1000 }]),
    AuthModule,
    UsersModule,
    AuditModule,
    ScopeModule,
    SyncModule,
    PainelModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: OncoThrottlerGuard }],
})
export class AppModule {}
