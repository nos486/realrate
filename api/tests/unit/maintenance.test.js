import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = { maintenance_mode: 0, maintenance_message: '' };
vi.mock('../../src/repositories/settings.repository.js', () => ({
  getGlobalSettings: vi.fn(async () => settings),
}));
vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { getMaintenance, enforceMaintenance, assertNotMaintenance, DEFAULT_MAINTENANCE_MESSAGE } = await import('../../src/lib/maintenance.js');

const request = new Request('https://api.realrate.ir/api/loans');

describe('maintenance mode', () => {
  beforeEach(() => {
    settings.maintenance_mode = 0;
    settings.maintenance_message = '';
    getAuthenticatedUser.mockReset();
  });

  it('lets everyone through while off', async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(enforceMaintenance(request, {})).resolves.toBeUndefined();
    await expect(assertNotMaintenance({}, 'user@example.com')).resolves.toBeUndefined();
    expect(await getMaintenance({})).toEqual({ enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE });
  });

  it('blocks guests and users with 503 MAINTENANCE and the admin message', async () => {
    settings.maintenance_mode = 1;
    settings.maintenance_message = 'تا ساعت ۱۰ در دسترس نیستیم';
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(enforceMaintenance(request, {})).rejects.toMatchObject({ statusCode: 503, code: 'MAINTENANCE', message: 'تا ساعت ۱۰ در دسترس نیستیم' });
    getAuthenticatedUser.mockResolvedValue({ email: 'user@example.com', role: 'user' });
    await expect(enforceMaintenance(request, {})).rejects.toMatchObject({ statusCode: 503 });
    await expect(assertNotMaintenance({}, 'user@example.com')).rejects.toMatchObject({ code: 'MAINTENANCE' });
  });

  it('keeps admins working', async () => {
    settings.maintenance_mode = 1;
    getAuthenticatedUser.mockResolvedValue({ email: 'admin@example.com', role: 'admin' });
    await expect(enforceMaintenance(request, {})).resolves.toBeUndefined();
    await expect(assertNotMaintenance({}, 'admin@example.com')).resolves.toBeUndefined();
  });
});
