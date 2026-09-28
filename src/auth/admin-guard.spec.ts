import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

// Paths reachable without an admin token, on purpose. Anything else found
// below must be behind JwtAuthGuard + AdminGuard: this panel sees every
// client, order and document.
const PUBLIC = ['', 'auth'];

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

// Every class the file exports that Nest would mount as a controller.
const controllers = controllerFiles(join(__dirname, '..')).flatMap((file) =>
  Object.values(require(file) as Record<string, unknown>)
    .filter((value): value is new (...args: never[]) => unknown => typeof value === 'function')
    .filter((cls) => Reflect.getMetadata(PATH_METADATA, cls) !== undefined)
    .map((cls) => ({ name: cls.name, path: String(Reflect.getMetadata(PATH_METADATA, cls)).replace(/^\/+|\/+$/g, ''), cls })),
);

describe('admin-only routes', () => {
  it('finds the controllers at all', () => {
    expect(controllers.length).toBeGreaterThan(5);
  });

  it.each(controllers.filter((c) => !PUBLIC.includes(c.path)).map((c) => [c.name, c]))(
    '%s is behind JwtAuthGuard and AdminGuard',
    (_, c) => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, c.cls) ?? []) as unknown[];
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, AdminGuard]));
    },
  );
});

describe('AdminGuard', () => {
  const context = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as ExecutionContext;
  const guard = new AdminGuard();

  it('lets ADMIN through', () => {
    expect(guard.canActivate(context({ id: 1, role: 'ADMIN' }))).toBe(true);
  });

  it.each([
    ['a client', { id: 1, role: 'USER' }],
    ['no role', { id: 1, role: null }],
    ['lower-case admin', { id: 1, role: 'admin' }],
    ['no user', undefined],
  ])('refuses %s', (_, user) => {
    expect(() => guard.canActivate(context(user))).toThrow(ForbiddenException);
  });
});
