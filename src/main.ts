import { setDefaultResultOrder } from 'node:dns';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

// Mesmo ajuste do SIMDASH: IPv4 primeiro (no Railway a saída IPv6 trava chamadas externas, como o e-mail).
setDefaultResultOrder('ipv4first');

function checkRequiredEnv(): void {
  const missing = ['JWT_SECRET', 'CPF_ENCRYPTION_KEY'].filter((k) => !process.env[k]);
  if (process.env.NODE_ENV === 'production') {
    for (const k of ['CORS_ORIGIN', 'FRONTEND_URL']) if (!process.env[k]) missing.push(k);
  }
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}. Veja .env.example.`);
  }
}

async function bootstrap() {
  checkRequiredEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Atrás de proxy (Railway / repasse do Next): sem isso req.ip seria o do proxy.
  // TRUST_PROXY = quantos proxies confiáveis há na frente da API (padrão 1).
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');
  app.use(cookieParser());
  // gzip nas respostas (os dados do painel são grandes). O andamento ao vivo da
  // atualização (SSE) fica de fora: compactado, ele só chegaria no fim.
  app.use(
    compression({
      filter: (req, res) => !req.path.endsWith('/sync/stream') && compression.filter(req, res),
    }),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  // Diferente do SIMDASH: sem CORS_ORIGIN, nenhuma outra origem é liberada.
  // O front normalmente chama a API pelo próprio endereço (/api/*), sem CORS.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean) : false,
    credentials: true,
  });

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
