import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SyncService } from './sync.service.js';

/** Horários sempre de Brasília, não importa o fuso do servidor (Railway roda em UTC). */
const FUSO_BRASIL = 'America/Sao_Paulo';

/**
 * Atualização automática com o banco do APAC Onco — mesma cadência do
 * SIMDASH: todo dia às 9h, 13h e 17h (Brasília), mais um horário extra
 * opcional em SYNC_EXTRA_HOUR ("21" ou "9:30"). Sem SOURCE_DB_* no .env o
 * agendamento não faz nada (útil em desenvolvimento).
 */
@Injectable()
export class SyncCron implements OnModuleInit {
  private readonly logger = new Logger(SyncCron.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  @Cron('0 9,13,17 * * *', { name: 'sync-apac-onco', timeZone: FUSO_BRASIL })
  async agendado(): Promise<void> {
    await this.executar('9h/13h/17h');
  }

  onModuleInit(): void {
    if (!this.syncService.isConfigured()) {
      this.logger.warn('SOURCE_DB_* não configuradas — atualização automática desligada.');
      return;
    }
    const bruto = process.env.SYNC_EXTRA_HOUR?.trim();
    if (!bruto) return;

    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(bruto);
    const hora = m ? Number(m[1]) : NaN;
    const minuto = m?.[2] !== undefined ? Number(m[2]) : 0;
    if (!m || hora > 23 || minuto > 59) {
      this.logger.warn(`SYNC_EXTRA_HOUR="${bruto}" inválido (use "21" ou "9:30") — horário extra ignorado.`);
      return;
    }
    const rotulo = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
    const job = CronJob.from({
      cronTime: `${minuto} ${hora} * * *`,
      timeZone: FUSO_BRASIL,
      start: true,
      onTick: () => {
        this.executar(`extra, ${rotulo}`).catch((err: unknown) => this.logger.error(String(err)));
      },
    });
    this.schedulerRegistry.addCronJob('sync-apac-onco-extra', job);
    this.logger.log(`Horário extra de atualização: ${rotulo} (Brasília)`);
  }

  private async executar(rotulo: string): Promise<void> {
    if (!this.syncService.isConfigured()) return;
    this.logger.log(`Atualização automática (${rotulo})...`);
    const r = await this.syncService.run();
    if (r.success) this.logger.log('Atualização automática concluída.');
    else this.logger.error(`Atualização automática falhou: ${r.error}`);
  }
}
