import type { TunnloEvent, Filter } from '@tunnlo/core';

export interface Tenant {
  id: string;
  name: string;
  enabled: boolean;
  config: TenantConfig;
  created_at: string;
}

export interface TenantConfig {
  max_events_per_minute?: number;
  max_tokens_per_hour?: number;
  allowed_adapters?: string[];
  allowed_models?: string[];
  metadata?: Record<string, any>;
}

export class TenantManager {
  private tenants = new Map<string, Tenant>();

  addTenant(tenant: Tenant): void {
    this.tenants.set(tenant.id, tenant);
  }

  removeTenant(id: string): boolean {
    return this.tenants.delete(id);
  }

  getTenant(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }

  listTenants(): Tenant[] {
    return [...this.tenants.values()];
  }

  isEnabled(id: string): boolean {
    return this.tenants.get(id)?.enabled ?? false;
  }

  validateAccess(tenantId: string, resource: string, resourceType: 'adapter' | 'model'): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || !tenant.enabled) return false;

    if (resourceType === 'adapter' && tenant.config.allowed_adapters) {
      return tenant.config.allowed_adapters.includes(resource);
    }

    if (resourceType === 'model' && tenant.config.allowed_models) {
      return tenant.config.allowed_models.includes(resource);
    }

    return true;
  }
}

export class TenantIsolationFilter implements Filter {
  name = 'tenant-isolation';
  private tenantId: string;
  private manager: TenantManager;

  constructor(tenantId: string, manager: TenantManager) {
    this.tenantId = tenantId;
    this.manager = manager;
  }

  process(event: TunnloEvent): TunnloEvent | null {
    if (!this.manager.isEnabled(this.tenantId)) {
      return null;
    }

    // Tag event with tenant ID
    return {
      ...event,
      metadata: {
        ...event.metadata,
        tenant_id: this.tenantId,
      },
    };
  }
}
