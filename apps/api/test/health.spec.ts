import { HealthController } from '../src/health.controller';

describe('HealthController', () => {
  it('returns ok response', () => {
    const controller = new HealthController();
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('hr-api');
  });
});
