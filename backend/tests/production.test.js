const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
process.env.NODE_ENV = 'production';
delete process.env.VERCEL;
const app = require('../src/app');
const hasBuild = fs.existsSync(path.join(__dirname, '../../frontend/dist/index.html'));
(hasBuild ? test : test.skip)('production serves the frontend and keeps missing API routes as JSON 404', async () => {
  const page = await request(app).get('/');
  expect(page.status).toBe(200);
  expect(page.text).toContain('Fielddesk');
  const api = await request(app).get('/api/not-found');
  expect(api.status).toBe(404);
  expect(api.body.success).toBe(false);
  expect((await request(app).get('/api/reports')).status).toBe(404);
});
test('Render does not acknowledge ephemeral file storage as persistent', async () => {
  const before = process.env.RENDER;
  const directory = process.env.WORKSPACE_DATA_DIR;
  process.env.RENDER = 'true';
  delete process.env.WORKSPACE_DATA_DIR;
  const health = await request(app).get('/api/workspace/health');
  expect(health.body.storage).toBe('local-only');
  if (before === undefined) delete process.env.RENDER; else process.env.RENDER = before;
  if (directory !== undefined) process.env.WORKSPACE_DATA_DIR = directory;
});
