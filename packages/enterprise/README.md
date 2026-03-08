# @tunnlo/enterprise

Enterprise features for Tunnlo: multi-tenancy, RBAC, and audit logging.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/enterprise
```

## Usage

```ts
import { TenantManager, RBACManager, AuditLogger, FileAuditStore } from '@tunnlo/enterprise';

// Multi-tenancy
const tenants = new TenantManager();
tenants.addTenant({ id: 'acme', name: 'Acme Corp', config: {} });

// Role-based access control
const rbac = new RBACManager();
rbac.addRole({ name: 'operator', permissions: ['pipeline:read', 'pipeline:start'] });
rbac.authorize(user, 'pipeline:start');

// Audit logging
const auditStore = new FileAuditStore('/var/log/tunnlo/audit.jsonl');
const audit = new AuditLogger(auditStore);
await audit.log({ actor: 'admin', action: 'pipeline.start', resource: 'prod-pipeline' });
```

## API

### Multi-Tenancy

- **`TenantManager`** -- manages tenant lifecycle and configuration
- **`TenantIsolationFilter`** -- pipeline filter that enforces tenant data isolation

### Access Control

- **`RBACManager`** -- role-based access control with permission checks

### Audit Logging

- **`AuditLogger`** -- records actions and events for compliance
- **`FileAuditStore`** -- file-backed audit log storage

## License

MIT
