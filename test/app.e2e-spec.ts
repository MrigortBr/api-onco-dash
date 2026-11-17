import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../src/app.controller.js';

// Teste leve (sem banco). O fluxo completo convite → ativação → login foi
// validado contra PostgreSQL; ver README, seção "Testes".
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [AppController] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' }));
});
