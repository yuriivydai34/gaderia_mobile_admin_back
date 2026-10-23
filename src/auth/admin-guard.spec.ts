import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AdminGuard } from './admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

// Paths reachable without an admin token, on purpose. Anything else found
// below must be behind JwtAuthGuard + AdminGuard: this panel sees every
// client, order and document. health is for a monitoring agent, which has no
// token, and answers with states and timings only.
const PUBLIC = ['', 'auth', 'health'];

// Single routes that are open inside an otherwise admin-only controller. The
// app's promotions carousel is public the moment it is switched on, and a
// carousel that needs a token is one app-server must carry credentials for.
const PUBLIC_ROUTES = ['banners/active'];

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
      const onClass = (Reflect.getMetadata(GUARDS_METADATA, c.cls) ?? []) as unknown[];
      if (onClass.length > 0) {
        expect(onClass).toEqual(expect.arrayContaining([JwtAuthGuard, AdminGuard]));
        return;
      }

      // No guards on the class: then every route of it must carry its own,
      // except the few listed above. Checked route by route, so a controller
      // that guards most of its methods and forgets one still fails here.
      const proto = c.cls.prototype as object;
      const routes = Object.getOwnPropertyNames(proto)
        // The constructor carries the class's own path metadata, which would
        // otherwise read as a route with no guards on it.
        .filter((name) => name !== 'constructor')
        .map((name) => Object.getOwnPropertyDescriptor(proto, name)?.value as unknown)
        .filter(
          (fn): fn is (...args: never[]) => unknown =>
            typeof fn === 'function' && Reflect.getMetadata(PATH_METADATA, fn) !== undefined,
        );

      expect(routes.length).toBeGreaterThan(0);
      for (const route of routes) {
        const path = `${c.path}/${String(Reflect.getMetadata(PATH_METADATA, route))}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '');
        if (PUBLIC_ROUTES.includes(path)) continue;
        expect(Reflect.getMetadata(GUARDS_METADATA, route) ?? []).toEqual(
          expect.arrayContaining([JwtAuthGuard, AdminGuard]),
        );
      }
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
