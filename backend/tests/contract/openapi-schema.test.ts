import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import yaml from 'js-yaml';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface OpenApiDoc {
  info: { title: string; version: string };
  paths: Record<string, unknown>;
}

describe('Schéma OpenAPI servi vs contracts/openapi.yaml', () => {
  let app: FastifyInstance;
  let referenceSpec: OpenApiDoc;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const specPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'specs',
      '001-carte-arretes-rave-teknival',
      'contracts',
      'openapi.yaml',
    );
    referenceSpec = yaml.load(readFileSync(specPath, 'utf-8')) as OpenApiDoc;
  });

  afterAll(async () => {
    await app.close();
  });

  it('expose le document OpenAPI publiquement', async () => {
    const res = await request(app.server).get('/documentation/json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi');
    expect(res.body).toHaveProperty('paths');
  });

  it('expose les 3 endpoints minimaux requis par FR-010/contracts/openapi.yaml', async () => {
    const res = await request(app.server).get('/documentation/json');
    const servedPaths = Object.keys(res.body.paths);

    for (const referencePath of Object.keys(referenceSpec.paths)) {
      expect(servedPaths).toContain(referencePath);
    }
  });

  it('correspond au titre du contrat de référence', async () => {
    const res = await request(app.server).get('/documentation/json');
    expect(res.body.info.title).toBe(referenceSpec.info.title);
  });
});
