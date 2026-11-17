import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('responde ok no /health', () => {
    expect(new AppController().health()).toEqual({ status: 'ok' });
  });
});
