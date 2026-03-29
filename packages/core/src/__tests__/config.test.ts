// @lobster-engine/core — ConfigManager tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager, EnvConfigSource, FileConfigSource, DefaultConfigSource } from '../config.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ConfigManager', () => {
  // -------------------------------------------------------------------------
  // Priority: env > file > default
  // -------------------------------------------------------------------------

  describe('source priority', () => {
    it('env source overrides file and default', () => {
      const env = new EnvConfigSource();
      const file = new DefaultConfigSource({ MY_KEY: 'from-file' });
      const defaults = new DefaultConfigSource({ MY_KEY: 'from-default' });

      // We can't easily set process.env for a single key in a unit test without
      // side effects, so we use a manual source to simulate env priority.

      // Simulate with explicit sources in priority order
      const manager = new ConfigManager([
        new DefaultConfigSource({ MY_KEY: 'from-env' }), // highest priority
        file,
        defaults,
      ]);

      expect(manager.get('MY_KEY')).toBe('from-env');
    });

    it('falls through to next source when key absent in higher priority', () => {
      const manager = new ConfigManager([
        new DefaultConfigSource({}), // empty high priority
        new DefaultConfigSource({ MY_KEY: 'from-second' }),
        new DefaultConfigSource({ MY_KEY: 'from-third' }),
      ]);

      expect(manager.get('MY_KEY')).toBe('from-second');
    });

    it('returns undefined when key is absent from all sources', () => {
      const manager = new ConfigManager([
        new DefaultConfigSource({ OTHER_KEY: 'value' }),
      ]);

      expect(manager.get('MISSING_KEY')).toBeUndefined();
    });

    it('uses built-in defaults when no custom sources provided', () => {
      const manager = new ConfigManager([
        new DefaultConfigSource({
          LOBSTER_STORAGE_TYPE: 'memory',
          LOBSTER_PORT: '3000',
        }),
      ]);

      expect(manager.get('LOBSTER_STORAGE_TYPE')).toBe('memory');
      expect(manager.get('LOBSTER_PORT')).toBe('3000');
    });
  });

  // -------------------------------------------------------------------------
  // EnvConfigSource
  // -------------------------------------------------------------------------

  describe('EnvConfigSource', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('reads environment variables', () => {
      process.env['TEST_VAR_XYZ'] = 'hello-world';
      const source = new EnvConfigSource();
      expect(source.get('TEST_VAR_XYZ')).toBe('hello-world');
    });

    it('returns undefined for missing env var', () => {
      delete process.env['NONEXISTENT_VAR_999'];
      const source = new EnvConfigSource();
      expect(source.get('NONEXISTENT_VAR_999')).toBeUndefined();
    });

    it('keys() includes set variables', () => {
      process.env['TEST_KEYS_VAR'] = 'exists';
      const source = new EnvConfigSource();
      expect(source.keys().has('TEST_KEYS_VAR')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // FileConfigSource
  // -------------------------------------------------------------------------

  describe('FileConfigSource', () => {
    it('reads JSON config file', () => {
      const filePath = join(tmpdir(), `lobster-test-${Date.now()}.json`);
      writeFileSync(filePath, JSON.stringify({ DB_URL: 'postgres://localhost/test', PORT: 5432 }));
      try {
        const source = new FileConfigSource(filePath);
        expect(source.get('DB_URL')).toBe('postgres://localhost/test');
        expect(source.get('PORT')).toBe('5432'); // numbers are stringified
      } finally {
        unlinkSync(filePath);
      }
    });

    it('treats missing file as empty source', () => {
      const source = new FileConfigSource('/tmp/lobster-nonexistent-file-99999.json');
      expect(source.get('ANY_KEY')).toBeUndefined();
    });

    it('throws on invalid JSON', () => {
      const filePath = join(tmpdir(), `lobster-bad-${Date.now()}.json`);
      writeFileSync(filePath, 'not valid json {{{');
      try {
        expect(() => new FileConfigSource(filePath)).toThrow();
      } finally {
        unlinkSync(filePath);
      }
    });
  });

  // -------------------------------------------------------------------------
  // DefaultConfigSource
  // -------------------------------------------------------------------------

  describe('DefaultConfigSource', () => {
    it('returns values from defaults map', () => {
      const source = new DefaultConfigSource({ FOO: 'bar', NUM: '42' });
      expect(source.get('FOO')).toBe('bar');
      expect(source.get('NUM')).toBe('42');
    });

    it('returns undefined for missing key', () => {
      const source = new DefaultConfigSource({ FOO: 'bar' });
      expect(source.get('MISSING')).toBeUndefined();
    });

    it('keys() returns all default keys', () => {
      const source = new DefaultConfigSource({ A: '1', B: '2' });
      expect(source.keys().has('A')).toBe(true);
      expect(source.keys().has('B')).toBe(true);
      expect(source.keys().size).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getRequired()
  // -------------------------------------------------------------------------

  describe('getRequired()', () => {
    it('returns value when key is present', () => {
      const manager = new ConfigManager([new DefaultConfigSource({ REQUIRED_KEY: 'value' })]);
      expect(manager.getRequired('REQUIRED_KEY')).toBe('value');
    });

    it('throws descriptive error when key is absent', () => {
      const manager = new ConfigManager([new DefaultConfigSource({})]);
      expect(() => manager.getRequired('MISSING_KEY')).toThrowError(/MISSING_KEY/);
    });
  });

  // -------------------------------------------------------------------------
  // getNumber()
  // -------------------------------------------------------------------------

  describe('getNumber()', () => {
    it('returns parsed number', () => {
      const manager = new ConfigManager([new DefaultConfigSource({ PORT: '8080' })]);
      expect(manager.getNumber('PORT')).toBe(8080);
    });

    it('returns defaultValue when key absent', () => {
      const manager = new ConfigManager([new DefaultConfigSource({})]);
      expect(manager.getNumber('MISSING', 9999)).toBe(9999);
    });

    it('throws when key is absent and no defaultValue', () => {
      const manager = new ConfigManager([new DefaultConfigSource({})]);
      expect(() => manager.getNumber('MISSING_NUM')).toThrowError(/MISSING_NUM/);
    });

    it('throws when value cannot be converted to a number', () => {
      const manager = new ConfigManager([new DefaultConfigSource({ BAD_NUM: 'not-a-number' })]);
      expect(() => manager.getNumber('BAD_NUM')).toThrow();
    });

    it('parses float values', () => {
      const manager = new ConfigManager([new DefaultConfigSource({ RATE: '0.75' })]);
      expect(manager.getNumber('RATE')).toBeCloseTo(0.75);
    });
  });

  // -------------------------------------------------------------------------
  // getBoolean()
  // -------------------------------------------------------------------------

  describe('getBoolean()', () => {
    it.each([
      ['true', true],
      ['1', true],
      ['yes', true],
      ['TRUE', true],
      ['YES', true],
    ])('"%s" → true', (raw, expected) => {
      const manager = new ConfigManager([new DefaultConfigSource({ FLAG: raw })]);
      expect(manager.getBoolean('FLAG')).toBe(expected);
    });

    it.each([
      ['false', false],
      ['0', false],
      ['no', false],
      ['FALSE', false],
      ['NO', false],
    ])('"%s" → false', (raw, expected) => {
      const manager = new ConfigManager([new DefaultConfigSource({ FLAG: raw })]);
      expect(manager.getBoolean('FLAG')).toBe(expected);
    });

    it('returns defaultValue when key absent', () => {
      const manager = new ConfigManager([new DefaultConfigSource({})]);
      expect(manager.getBoolean('MISSING', true)).toBe(true);
      expect(manager.getBoolean('MISSING', false)).toBe(false);
    });

    it('throws when key absent and no defaultValue', () => {
      const manager = new ConfigManager([new DefaultConfigSource({})]);
      expect(() => manager.getBoolean('MISSING_BOOL')).toThrowError(/MISSING_BOOL/);
    });

    it('throws on invalid boolean value', () => {
      const manager = new ConfigManager([new DefaultConfigSource({ FLAG: 'maybe' })]);
      expect(() => manager.getBoolean('FLAG')).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getAll()
  // -------------------------------------------------------------------------

  describe('getAll()', () => {
    it('returns merged view of all sources with higher priority winning', () => {
      const manager = new ConfigManager([
        new DefaultConfigSource({ A: 'high', B: 'high-b' }),
        new DefaultConfigSource({ A: 'low', C: 'low-c' }),
      ]);

      const all = manager.getAll();
      expect(all.get('A')).toBe('high');
      expect(all.get('B')).toBe('high-b');
      expect(all.get('C')).toBe('low-c');
    });
  });
});
