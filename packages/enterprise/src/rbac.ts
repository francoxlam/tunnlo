export type Permission =
  | 'pipeline:start'
  | 'pipeline:stop'
  | 'pipeline:status'
  | 'config:read'
  | 'config:write'
  | 'adapter:manage'
  | 'filter:manage'
  | 'action:execute'
  | 'dashboard:view'
  | 'dashboard:edit'
  | 'audit:read'
  | 'tenant:manage'
  | 'admin';

export interface Role {
  name: string;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  roles: string[];
  tenant_id?: string;
  api_key?: string;
}

const BUILT_IN_ROLES: Record<string, Role> = {
  admin: {
    name: 'admin',
    permissions: ['admin'],
  },
  operator: {
    name: 'operator',
    permissions: [
      'pipeline:start',
      'pipeline:stop',
      'pipeline:status',
      'config:read',
      'config:write',
      'adapter:manage',
      'filter:manage',
      'action:execute',
      'dashboard:view',
      'dashboard:edit',
      'audit:read',
    ],
  },
  viewer: {
    name: 'viewer',
    permissions: [
      'pipeline:status',
      'config:read',
      'dashboard:view',
      'audit:read',
    ],
  },
  agent: {
    name: 'agent',
    permissions: [
      'pipeline:status',
      'action:execute',
    ],
  },
};

export class RBACManager {
  private roles = new Map<string, Role>();
  private users = new Map<string, User>();

  constructor() {
    // Register built-in roles
    for (const [name, role] of Object.entries(BUILT_IN_ROLES)) {
      this.roles.set(name, role);
    }
  }

  addRole(role: Role): void {
    this.roles.set(role.name, role);
  }

  removeRole(name: string): boolean {
    if (BUILT_IN_ROLES[name]) {
      throw new Error(`Cannot remove built-in role "${name}"`);
    }
    return this.roles.delete(name);
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }

  removeUser(id: string): boolean {
    return this.users.delete(id);
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByApiKey(apiKey: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.api_key === apiKey) return user;
    }
    return undefined;
  }

  hasPermission(userId: string, permission: Permission): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    for (const roleName of user.roles) {
      const role = this.roles.get(roleName);
      if (!role) continue;

      if (role.permissions.includes('admin')) return true;
      if (role.permissions.includes(permission)) return true;
    }

    return false;
  }

  getUserPermissions(userId: string): Permission[] {
    const user = this.users.get(userId);
    if (!user) return [];

    const permissions = new Set<Permission>();
    for (const roleName of user.roles) {
      const role = this.roles.get(roleName);
      if (role) {
        for (const perm of role.permissions) {
          permissions.add(perm);
        }
      }
    }

    return [...permissions];
  }

  listRoles(): Role[] {
    return [...this.roles.values()];
  }

  listUsers(): User[] {
    return [...this.users.values()];
  }
}
