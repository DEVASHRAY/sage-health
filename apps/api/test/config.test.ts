import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env';
import { installLocalProxy } from '../src/infra/localProxy';

const required = { DATABASE_URL: 'postgresql://sage@localhost:5432/sage', GEMINI_API_KEY: 'k' };

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(required)).toMatchObject({
      geminiModels: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
      estimateTimeoutMs: 12_000,
      port: 3000,
      corsOrigins: [],
      estimateRateLimitPerMinute: 30,
    });
  });

  it('parses lists and numbers', () => {
    const config = loadConfig({
      ...required,
      GEMINI_MODELS: ' model-a , model-b,',
      ESTIMATE_TIMEOUT_MS: '8000',
      PORT: '8080',
      CORS_ORIGINS: 'https://a.example,https://b.example',
    });

    expect(config).toMatchObject({
      geminiModels: ['model-a', 'model-b'],
      estimateTimeoutMs: 8000,
      port: 8080,
      corsOrigins: ['https://a.example', 'https://b.example'],
    });
  });

  it('treats blank variables as unset', () => {
    expect(loadConfig({ ...required, PORT: '', GEMINI_MODELS: ' ' })).toMatchObject({
      port: 3000,
      geminiModels: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    });
  });

  it('names every bad variable without echoing values', () => {
    const attempt = () =>
      loadConfig({ DATABASE_URL: 'mysql://secret-host/db', ESTIMATE_TIMEOUT_MS: 'soon' });

    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/DATABASE_URL[\s\S]*GEMINI_API_KEY[\s\S]*ESTIMATE_TIMEOUT_MS/);
    expect(attempt).not.toThrow(/secret-host/);
  });

  it('rejects a model list with no models', () => {
    expect(() => loadConfig({ ...required, GEMINI_MODELS: ',,' })).toThrow(/GEMINI_MODELS/);
  });
});

describe('installLocalProxy', () => {
  it('does nothing without HTTPS_PROXY', () => {
    expect(installLocalProxy({})).toBe(false);
  });

  it('never activates in production', () => {
    expect(installLocalProxy({ NODE_ENV: 'production', HTTPS_PROXY: 'http://127.0.0.1:1' })).toBe(
      false,
    );
  });
});
