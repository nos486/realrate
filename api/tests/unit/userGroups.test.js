/**
 * userGroups.test.js — Groups of users and features open only to some groups
 *
 * The rules (config/features.js) as pure functions; the groups, members and requests on real
 * SQLite (D1); and the routes end to end: a regular user is offered the "pro" group for the market
 * page, asks to join, the admin approves, and the market page opens — and the admin can change
 * who gets a feature at runtime.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { sqliteD1 } from '../helpers/sqliteD1.js';

vi.mock('../../src/lib/auth.js', () => ({
  getAuthenticatedUser: vi.fn(),
  isUserAdmin: (email) => email === 'admin@example.com',
}));

const { getAuthenticatedUser } = await import('../../src/lib/auth.js');
const { isFeatureEnabled, enabledFeatures, mergeFeatureRules, validateFeatureRule, FEATURES } = await import('../../src/config/features.js');
const { validateGroup, isValidGroupKey, PRO_GROUP_KEY } = await import('../../src/domain/userGroups.js');
const { ensureSchema, resetD1SchemaCache } = await import('../../src/repositories/index.js').then(async (m) => ({
  ensureSchema: m.ensureSchema,
  resetD1SchemaCache: (await import('../../src/repositories/d1Schema.js')).resetD1SchemaCache,
}));
const repo = await import('../../src/repositories/userGroups.repository.js');
const features = await import('../../src/lib/features.js');
const routes = await import('../../src/handlers/groupRoutes.js');

describe('feature rules with groups', () => {
  const rules = {
    ...FEATURES,
    market: { ...FEATURES.market, stage: 'ga', groups: ['pro'] },
    expenses: { ...FEATURES.expenses, stage: 'ga', groups: [] },
  };

  it('opens a group-restricted feature only to its groups, admins and the demo', () => {
    expect(isFeatureEnabled('market', { userId: 'u', role: 'user', groups: [] }, rules)).toBe(false);
    expect(isFeatureEnabled('market', { userId: 'u', role: 'user', groups: ['pro'] }, rules)).toBe(true);
    expect(isFeatureEnabled('market', { userId: 'u', role: 'user', groups: ['vip'] }, rules)).toBe(false);
    expect(isFeatureEnabled('market', { userId: 'a', role: 'admin' }, rules)).toBe(true);
    expect(isFeatureEnabled('market', { userId: 'd', role: 'user', kind: 'demo_view' }, rules)).toBe(true);
    expect(isFeatureEnabled('market', null, rules)).toBe(false);
  });

  it('keeps off, beta and unknown features as before', () => {
    const user = { role: 'user', groups: ['pro'] };
    expect(isFeatureEnabled('market', user, { ...rules, market: { stage: 'off', groups: ['pro'] } })).toBe(false);
    expect(isFeatureEnabled('market', user, { ...rules, market: { stage: 'beta', groups: [] } })).toBe(false);
    expect(isFeatureEnabled('market', { role: 'admin' }, { ...rules, market: { stage: 'beta', groups: [] } })).toBe(true);
    expect(isFeatureEnabled('nope', { role: 'admin' }, rules)).toBe(false);
    expect(isFeatureEnabled('expenses', { role: 'user' }, rules)).toBe(true);
    expect(enabledFeatures({ role: 'user', groups: [] }, rules)).not.toContain('market');
  });

  it('lays only a known feature\'s stage and groups over the defaults', () => {
    const merged = mergeFeatureRules({ market: { stage: 'ga', groups: [], label: 'x' }, ghost: { stage: 'ga' }, cheque_scan: { stage: 'weird' } });
    expect(merged.market).toMatchObject({ stage: 'ga', groups: [], label: FEATURES.market.label });
    expect(merged.ghost).toBeUndefined();
    expect(merged.cheque_scan.stage).toBe(FEATURES.cheque_scan.stage);
    expect(mergeFeatureRules(null).market.groups).toEqual(['pro']);
  });

  it('validates the admin\'s rule and the groups it names', () => {
    expect(validateFeatureRule('market', { stage: 'ga', groups: ['pro', 'pro'] }, ['pro'])).toEqual({ value: { stage: 'ga', groups: ['pro'] } });
    expect(validateFeatureRule('market', { stage: 'beta', groups: ['pro'] }, ['pro'])).toEqual({ value: { stage: 'beta', groups: [] } });
    expect(validateFeatureRule('market', { stage: 'ga', groups: ['vip'] }, ['pro']).error).toBeTruthy();
    expect(validateFeatureRule('market', { stage: 'maybe' }, ['pro']).error).toBeTruthy();
    expect(validateFeatureRule('ghost', { stage: 'ga' }, []).error).toBeTruthy();
  });

  it('validates groups', () => {
    expect(isValidGroupKey('pro')).toBe(true);
    expect(isValidGroupKey('Pro')).toBe(false);
    expect(isValidGroupKey('1pro')).toBe(false);
    expect(validateGroup({ key: ' VIP_1 ', name: ' طلایی ', allowRequests: true })).toEqual({
      value: { key: 'vip_1', name: 'طلایی', description: '', allowRequests: true },
    });
    expect(validateGroup({ key: 'vip', name: '' }).error).toBeTruthy();
    expect(validateGroup({ name: 'x' }, { partial: true })).toEqual({ value: { name: 'x' } });
  });
});

describe('groups on SQLite (D1), and the routes', () => {
  let env;
  const ADMIN = { userId: 'adm', email: 'admin@example.com', role: 'admin' };
  // A fresh object per request, as the auth layer gives one per request (groups are read on it)
  const asUser = () => getAuthenticatedUser.mockImplementation(async () => ({ userId: 'u1', email: 'u1@example.com', role: 'user' }));
  const asAdmin = () => getAuthenticatedUser.mockImplementation(async () => ({ ...ADMIN }));
  const req = (method, path, body) => new Request(`https://api.realrate.ir${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = async (res) => (await res).json();

  beforeAll(async () => {
    resetD1SchemaCache();
    env = { DB: sqliteD1() };
    await ensureSchema(env);
    const now = new Date().toISOString();
    for (const id of ['u1', 'u2']) {
      await env.DB.prepare('INSERT INTO users (id, email, name, created_at, last_login) VALUES (?, ?, ?, ?, ?)')
        .bind(id, `${id}@example.com`, id.toUpperCase(), now, now).run();
    }
  });
  afterAll(() => env.DB.close());
  beforeEach(() => features.resetFeatureRulesMemo());

  it('starts with the system "pro" group, which accepts requests', async () => {
    const pro = await repo.dbGetGroupByKey(env, PRO_GROUP_KEY);
    expect(pro).toMatchObject({ id: 'grp_pro', key: 'pro', allowRequests: true, isSystem: true });
  });

  it('a regular user does not get the market page, and is offered the pro group', async () => {
    asUser();
    const access = await json(routes.handleGetFeatureAccess(req('GET', '/api/features/market/access'), env, { key: 'market' }));
    expect(access).toMatchObject({ enabled: false, groups: [{ key: 'pro', allowRequests: true, requested: false }] });
    await expect(features.requireFeature(req('GET', '/api/sparklines'), env, 'market')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('asks to join; the admin sees the request and approves it; the market page opens', async () => {
    asUser();
    await routes.handleRequestGroup(req('POST', '/api/groups/pro/request', { note: 'لطفاً' }), env, { key: 'pro' });
    const access = await json(routes.handleGetFeatureAccess(req('GET', '/x'), env, { key: 'market' }));
    expect(access.groups[0].requested).toBe(true);
    expect(await repo.dbGetUserRequestedGroupKeys(env, 'u1')).toEqual(['pro']);

    asAdmin();
    const panel = await json(routes.handleAdminListGroups(req('GET', '/api/admin/groups'), env));
    expect(panel.requests).toEqual([expect.objectContaining({ groupId: 'grp_pro', userId: 'u1', note: 'لطفاً' })]);
    expect(panel.groups.find((g) => g.key === 'pro')).toMatchObject({ memberCount: 0, requestCount: 1 });
    expect(panel.features.find((f) => f.key === 'market')).toMatchObject({ stage: 'ga', groups: ['pro'], customized: false });

    await routes.handleAdminAnswerRequest(req('POST', '/x', { approve: true }), env, { groupId: 'grp_pro', userId: 'u1' });
    expect(await repo.dbListGroupRequests(env)).toEqual([]);
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual(['pro']);

    asUser();
    expect(await features.requireFeature(req('GET', '/api/sparklines'), env, 'market')).toMatchObject({ userId: 'u1', groups: ['pro'] });
    expect(await features.userFeatures(env, { userId: 'u1', role: 'user' })).toContain('market');
    // A member can't ask again
    await expect(routes.handleRequestGroup(req('POST', '/x'), env, { key: 'pro' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a rejected request just goes away', async () => {
    getAuthenticatedUser.mockImplementation(async () => ({ userId: 'u2', email: 'u2@example.com', role: 'user' }));
    await routes.handleRequestGroup(req('POST', '/x'), env, { key: 'pro' });
    asAdmin();
    await routes.handleAdminAnswerRequest(req('POST', '/x', { approve: false }), env, { groupId: 'grp_pro', userId: 'u2' });
    expect(await repo.dbListGroupRequests(env)).toEqual([]);
    expect(await repo.dbGetUserGroupKeys(env, 'u2')).toEqual([]);
  });

  it('the admin creates a group, adds and removes members by email, and pages them', async () => {
    asAdmin();
    const { group } = await json(routes.handleAdminCreateGroup(req('POST', '/x', { key: 'vip', name: 'ویژه', allowRequests: false }), env));
    expect(group).toMatchObject({ key: 'vip', isSystem: false, allowRequests: false });
    await expect(routes.handleAdminCreateGroup(req('POST', '/x', { key: 'vip', name: 'دوباره' }), env)).rejects.toMatchObject({ statusCode: 400 });

    await routes.handleAdminAddMember(req('POST', '/x', { email: 'U2@example.com' }), env, { groupId: group.id });
    await routes.handleAdminAddMember(req('POST', '/x', { userId: 'u1' }), env, { groupId: group.id });
    await expect(routes.handleAdminAddMember(req('POST', '/x', { email: 'nobody@example.com' }), env, { groupId: group.id }))
      .rejects.toMatchObject({ statusCode: 404 });
    const page = await json(routes.handleAdminListMembers(req('GET', `/api/admin/groups/${group.id}/members?q=u2`), env, { groupId: group.id }));
    expect(page).toMatchObject({ total: 1, members: [expect.objectContaining({ userId: 'u2', email: 'u2@example.com' })] });

    await routes.handleAdminRemoveMember(req('DELETE', '/x'), env, { groupId: group.id, userId: 'u2' });
    expect(await repo.dbGetUserGroupKeys(env, 'u2')).toEqual([]);

    // Not open to requests
    getAuthenticatedUser.mockImplementation(async () => ({ userId: 'u2', role: 'user' }));
    await expect(routes.handleRequestGroup(req('POST', '/x'), env, { key: 'vip' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('the admin changes who gets a feature at runtime, and resets it', async () => {
    asAdmin();
    // Open the market page to everyone
    await routes.handleAdminSaveFeatureRule(req('PUT', '/x', { stage: 'ga', groups: [] }), env, { key: 'market' });
    expect(await features.hasFeature(env, { userId: 'u2', role: 'user' }, 'market')).toBe(true);

    // Only the "vip" group, then a group that doesn't exist
    await routes.handleAdminSaveFeatureRule(req('PUT', '/x', { stage: 'ga', groups: ['vip'] }), env, { key: 'market' });
    expect(await features.hasFeature(env, { userId: 'u2', role: 'user' }, 'market')).toBe(false);
    expect(await features.hasFeature(env, { userId: 'u1', role: 'user' }, 'market')).toBe(true);
    await expect(routes.handleAdminSaveFeatureRule(req('PUT', '/x', { stage: 'ga', groups: ['ghost'] }), env, { key: 'market' }))
      .rejects.toMatchObject({ statusCode: 400 });

    // A group a feature uses can't be deleted; the system group never
    const vip = await repo.dbGetGroupByKey(env, 'vip');
    await expect(routes.handleAdminDeleteGroup(req('DELETE', '/x'), env, { groupId: vip.id })).rejects.toMatchObject({ statusCode: 400 });
    await expect(routes.handleAdminDeleteGroup(req('DELETE', '/x'), env, { groupId: 'grp_pro' })).rejects.toMatchObject({ statusCode: 400 });

    const { features: list } = await json(routes.handleAdminResetFeatureRule(req('DELETE', '/x'), env, { key: 'market' }));
    expect(list.find((f) => f.key === 'market')).toMatchObject({ groups: ['pro'], customized: false });
    await routes.handleAdminDeleteGroup(req('DELETE', '/x'), env, { groupId: vip.id });
    expect(await repo.dbGetGroupByKey(env, 'vip')).toBeNull();
    expect(await repo.dbGetUserGroupKeys(env, 'u1')).toEqual(['pro']);
  });

  it('every admin route refuses non-admins', async () => {
    asUser();
    await expect(routes.handleAdminListGroups(req('GET', '/x'), env)).rejects.toMatchObject({ statusCode: 403 });
    await expect(routes.handleAdminSaveFeatureRule(req('PUT', '/x', { stage: 'ga', groups: [] }), env, { key: 'market' }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(routes.handleAdminAddMember(req('POST', '/x', { userId: 'u1' }), env, { groupId: 'grp_pro' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});
