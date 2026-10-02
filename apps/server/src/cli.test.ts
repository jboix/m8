/** `--host` and `--port`, read the way Vite reads them. */
import { describe, expect, test } from 'bun:test';
import { ALL_INTERFACES, networkUrls, readFlags } from './cli.ts';

describe('readFlags', () => {
  test('reads nothing from nothing', () => {
    expect(readFlags([])).toEqual({});
  });

  test('takes a bare --host as every interface', () => {
    expect(readFlags(['--host'])).toEqual({ HOST: ALL_INTERFACES });
    expect(readFlags(['--host', '--port', '4000'])).toEqual({
      HOST: ALL_INTERFACES,
      PORT: '4000',
    });
  });

  test('takes a value after a space or an equals sign', () => {
    expect(readFlags(['--host', '127.0.0.1', '--port=4000'])).toEqual({
      HOST: '127.0.0.1',
      PORT: '4000',
    });
    expect(readFlags(['--host=192.168.1.20'])).toEqual({ HOST: '192.168.1.20' });
  });

  test('leaves other arguments alone', () => {
    expect(readFlags(['--watch', 'src/index.ts', '--port', '5000'])).toEqual({ PORT: '5000' });
  });
});

describe('networkUrls', () => {
  test('lists nothing when the server listens on one address', () => {
    expect(networkUrls('127.0.0.1', 3001)).toEqual([]);
  });

  test('lists http URLs on the port when it listens everywhere', () => {
    for (const url of networkUrls(ALL_INTERFACES, 3001))
      expect(url).toMatch(/^http:\/\/[\d.]+:3001$/);
  });
});
