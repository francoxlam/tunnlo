import { describe, it, expect } from 'vitest';
import { createEvent } from '@tunnlo/core';
import { TenantManager, TenantIsolationFilter } from './tenant.js';
import { RBACManager } from './rbac.js';
import { FileAuditStore, AuditLogger } from './audit.js';

describe('TenantManager', () => {
  it('adds and retrieves tenants', () => {
    const mgr = new TenantManager();
    mgr.addTenant({
      id: 't1',
      name: 'Acme',
      enabled: true,
      config: {},
      created_at: new Date().toISOString(),
    });

    expect(mgr.getTenant('t1')?.name).toBe('Acme');
    expect(mgr.listTenants()).toHaveLength(1);
  });

  it('validates adapter access', () => {
    const mgr = new TenantManager();
    mgr.addTenant({
      id: 't1',
      name: 'Acme',
      enabled: true,
      config: { allowed_adapters: ['native/stdin', 'native/tshark'] },
      created_at: new Date().toISOString(),
    });

    expect(mgr.validateAccess('t1', 'native/stdin', 'adapter')).toBe(true);
    expect(mgr.validateAccess('t1', 'native/log-tailer', 'adapter')).toBe(false);
  });

  it('returns false for disabled tenants', () => {
    const mgr = new TenantManager();
    mgr.addTenant({
      id: 't1',
      name: 'Disabled',
      enabled: false,
      config: {},
      created_at: new Date().toISOString(),
    });

    expect(mgr.isEnabled('t1')).toBe(false);
    expect(mgr.validateAccess('t1', 'native/stdin', 'adapter')).toBe(false);
  });

  it('removes tenants', () => {
    const mgr = new TenantManager();
    mgr.addTenant({ id: 't1', name: 'Acme', enabled: true, config: {}, created_at: '' });
    expect(mgr.removeTenant('t1')).toBe(true);
    expect(mgr.getTenant('t1')).toBeUndefined();
  });
});

describe('TenantIsolationFilter', () => {
  it('tags events with tenant ID', () => {
    const mgr = new TenantManager();
    mgr.addTenant({ id: 't1', name: 'Acme', enabled: true, config: {}, created_at: '' });

    const filter = new TenantIsolationFilter('t1', mgr);
    const event = createEvent('src', 'DATA', { msg: 'test' });
    const result = filter.process(event);

    expect(result).not.toBeNull();
    expect(result!.metadata?.tenant_id).toBe('t1');
  });

  it('drops events for disabled tenants', () => {
    const mgr = new TenantManager();
    mgr.addTenant({ id: 't1', name: 'Disabled', enabled: false, config: {}, created_at: '' });

    const filter = new TenantIsolationFilter('t1', mgr);
    const event = createEvent('src', 'DATA', { msg: 'test' });
    expect(filter.process(event)).toBeNull();
  });
});

describe('RBACManager', () => {
  it('has built-in roles', () => {
    const rbac = new RBACManager();
    const roles = rbac.listRoles();
    const roleNames = roles.map((r) => r.name);

    expect(roleNames).toContain('admin');
    expect(roleNames).toContain('operator');
    expect(roleNames).toContain('viewer');
    expect(roleNames).toContain('agent');
  });

  it('admin has all permissions', () => {
    const rbac = new RBACManager();
    rbac.addUser({ id: 'u1', name: 'Admin User', roles: ['admin'] });

    expect(rbac.hasPermission('u1', 'pipeline:start')).toBe(true);
    expect(rbac.hasPermission('u1', 'config:write')).toBe(true);
    expect(rbac.hasPermission('u1', 'tenant:manage')).toBe(true);
  });

  it('viewer has limited permissions', () => {
    const rbac = new RBACManager();
    rbac.addUser({ id: 'u1', name: 'Viewer', roles: ['viewer'] });

    expect(rbac.hasPermission('u1', 'pipeline:status')).toBe(true);
    expect(rbac.hasPermission('u1', 'config:read')).toBe(true);
    expect(rbac.hasPermission('u1', 'config:write')).toBe(false);
    expect(rbac.hasPermission('u1', 'pipeline:start')).toBe(false);
  });

  it('returns false for unknown user', () => {
    const rbac = new RBACManager();
    expect(rbac.hasPermission('unknown', 'admin')).toBe(false);
  });

  it('looks up users by API key', () => {
    const rbac = new RBACManager();
    rbac.addUser({ id: 'u1', name: 'Bot', roles: ['agent'], api_key: 'secret-123' });

    expect(rbac.getUserByApiKey('secret-123')?.id).toBe('u1');
    expect(rbac.getUserByApiKey('wrong')).toBeUndefined();
  });

  it('cannot remove built-in roles', () => {
    const rbac = new RBACManager();
    expect(() => rbac.removeRole('admin')).toThrow('Cannot remove built-in role');
  });

  it('adds and removes custom roles', () => {
    const rbac = new RBACManager();
    rbac.addRole({ name: 'custom', permissions: ['pipeline:status'] });
    rbac.addUser({ id: 'u1', name: 'Custom', roles: ['custom'] });

    expect(rbac.hasPermission('u1', 'pipeline:status')).toBe(true);
    expect(rbac.hasPermission('u1', 'config:write')).toBe(false);

    rbac.removeRole('custom');
  });

  it('getUserPermissions returns all permissions', () => {
    const rbac = new RBACManager();
    rbac.addUser({ id: 'u1', name: 'Op', roles: ['operator'] });

    const perms = rbac.getUserPermissions('u1');
    expect(perms).toContain('pipeline:start');
    expect(perms).toContain('dashboard:view');
    expect(perms).not.toContain('admin');
  });
});

describe('AuditLogger', () => {
  it('logs and queries actions', async () => {
    const store = new FileAuditStore('/tmp/tunnlo-test-audit.jsonl');
    const logger = new AuditLogger(store);

    await logger.logAction('user1', 'pipeline:start', 'pipeline', 'success');
    await logger.logAction('user2', 'config:write', 'filters', 'success', { filter: 'rate-limiter' });
    await logger.logAccessDenied('user3', 'pipeline:start', 'pipeline');

    const all = await logger.query({});
    expect(all).toHaveLength(3);

    const denied = await logger.query({ result: 'denied' });
    expect(denied).toHaveLength(1);
    expect(denied[0].actor).toBe('user3');

    const user1 = await logger.query({ actor: 'user1' });
    expect(user1).toHaveLength(1);
  });

  it('logs pipeline lifecycle events', async () => {
    const store = new FileAuditStore('/tmp/tunnlo-test-audit2.jsonl');
    const logger = new AuditLogger(store);

    await logger.logPipelineStart('admin', ['config.yaml']);
    await logger.logPipelineStop('admin');
    await logger.logConfigChange('admin', 'filters', { added: 'rate-limiter' });

    const results = await logger.query({ actor: 'admin' });
    expect(results).toHaveLength(3);
  });
});
