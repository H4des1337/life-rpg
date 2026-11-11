import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveBindHost, loadConfig } from '../src/config.js';

const origHost = process.env.HOST;
const origDocker = process.env.LIFERPG_DOCKER;

function envWith(host: string | undefined, docker: string | undefined): void {
  if (host === undefined) delete process.env.HOST;
  else process.env.HOST = host;
  if (docker === undefined) delete process.env.LIFERPG_DOCKER;
  else process.env.LIFERPG_DOCKER = docker;
}

beforeEach(() => {
  envWith(undefined, undefined);
});

afterEach(() => {
  if (origHost === undefined) delete process.env.HOST;
  else process.env.HOST = origHost;
  if (origDocker === undefined) delete process.env.LIFERPG_DOCKER;
  else process.env.LIFERPG_DOCKER = origDocker;
});

describe('resolveBindHost (native local-only enforcement)', () => {
  it('defaults to 127.0.0.1 when no HOST is set', () => {
    expect(resolveBindHost()).toBe('127.0.0.1');
  });

  it('accepts explicit 127.0.0.1 in native mode', () => {
    envWith('127.0.0.1', undefined);
    expect(resolveBindHost()).toBe('127.0.0.1');
  });

  it('accepts localhost in native mode', () => {
    envWith('localhost', undefined);
    expect(resolveBindHost()).toBe('localhost');
  });

  it('rejects 0.0.0.0 in native mode', () => {
    envWith('0.0.0.0', undefined);
    expect(() => resolveBindHost()).toThrow(/Refusing to bind/);
  });

  it('rejects a public interface in native mode', () => {
    envWith('192.168.1.50', undefined);
    expect(() => resolveBindHost()).toThrow(/Refusing to bind/);
  });

  it('accepts 0.0.0.0 when LIFERPG_DOCKER=1', () => {
    envWith('0.0.0.0', '1');
    expect(resolveBindHost()).toBe('0.0.0.0');
  });

  it('still defaults to 127.0.0.1 with LIFERPG_DOCKER=1 and no HOST', () => {
    envWith(undefined, '1');
    expect(resolveBindHost()).toBe('127.0.0.1');
  });
});

describe('loadConfig bind host', () => {
  it('returns 127.0.0.1 by default', () => {
    const config = loadConfig();
    expect(config.host).toBe('127.0.0.1');
  });

  it('returns 0.0.0.0 in Docker mode', () => {
    envWith('0.0.0.0', '1');
    const config = loadConfig();
    expect(config.host).toBe('0.0.0.0');
  });

  it('throws when HOST is non-loopback without Docker flag', () => {
    envWith('0.0.0.0', undefined);
    expect(() => loadConfig()).toThrow(/Refusing to bind/);
  });
});
