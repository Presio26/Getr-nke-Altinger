import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { createTestCore } from './test/helpers';

const GARBAGE: unknown[][] = [[], [null], [{}], ['x'], [123], [{ items: 'x', fulfillment: 'delivery' }], ['o-24817', 'x', 'y'], [[1, 2]], ['t-1', { speedFactor: 'schnell' }]];

describe('Robustheit', () => {
  it('ungültige Eingaben führen nie zu internen Fehlern', async () => {
    const t = createTestCore();
    const tokens: (string | undefined)[] = [undefined];
    for (const id of ['u-anna', 'u-gasthaus', 'u-toni', 'u-admin']) tokens.push((await t.as(id)).token);
    const methods = Object.keys(t.core.handlers).filter((m) => m !== 'resetDemo' && m !== 'logout');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const internal: string[] = [];
    for (const token of tokens) {
      for (const method of methods) {
        for (const args of GARBAGE) {
          try {
            await t.core.call(method, t.core.ctx(token), args);
          } catch (err) {
            expect(err).toBeInstanceOf(ApiError);
            if ((err as ApiError).code === 'internal') internal.push(`${method}(${JSON.stringify(args)})`);
          }
        }
      }
    }
    errorSpy.mockRestore();
    vi.restoreAllMocks();
    expect(internal).toEqual([]);
  });
});
