const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const request = require("supertest");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fielddesk-api-test-"));
process.env.WORKSPACE_DATA_DIR = dir;
delete process.env.VERCEL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;
const app = require("../src/app");
const workspace = "8ebdb119-9528-459c-af20-2f0711a7c5cc";
const other = "9ebdb119-9528-459c-af20-2f0711a7c5cc";
const recordId = "5ebdb119-9528-459c-af20-2f0711a7c5cc";
const record = {
  name: "Cliente de pruebas",
  createdAt: "2026-11-05T10:00:00.000Z",
  updatedAt: "2026-11-05T10:00:00.000Z",
};
const put = (data, collection = "clients") =>
  request(app)
    .put(`/api/workspace/${collection}/${recordId}`)
    .set("X-Workspace-Id", workspace)
    .send(data);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
test("health reports the actual storage mode", async () => {
  const result = await request(app).get("/api/workspace/health");
  expect(result.body.storage).toBe("file");
});
test("requires a valid workspace to prevent arbitrary file access", async () => {
  expect((await request(app).get("/api/workspace")).status).toBe(400);
  expect(
    (
      await request(app)
        .get("/api/workspace")
        .set("X-Workspace-Id", "../../private")
    ).status,
  ).toBe(400);
});
test("creates records idempotently and keeps workspaces isolated", async () => {
  expect((await put(record)).status).toBe(200);
  expect((await put(record)).status).toBe(200);
  const own = await request(app)
    .get("/api/workspace")
    .set("X-Workspace-Id", workspace);
  expect(own.body.data).toHaveLength(1);
  expect(own.body.data[0].name).toBe(record.name);
  const another = await request(app)
    .get("/api/workspace")
    .set("X-Workspace-Id", other);
  expect(another.body.data).toEqual([]);
});
test("stale offline retries cannot overwrite newer edits", async () => {
  await put({
    ...record,
    name: "Actualizado",
    updatedAt: "2026-11-05T12:00:00.000Z",
  });
  const stale = await put(record);
  expect(stale.body.data.name).toBe("Actualizado");
});
test("stores deletion tombstones and rejects outdated resurrection", async () => {
  await put({
    ...record,
    deleted: true,
    updatedAt: "2026-11-05T13:00:00.000Z",
  });
  const stale = await put(record);
  expect(stale.body.data.deleted).toBe(true);
});
test("rejects invalid collections, fields, states and visits", async () => {
  expect((await put(record, "secrets")).status).toBe(400);
  expect((await put({ ...record, name: ["invalid"] })).status).toBe(400);
  expect((await put({ ...record, name: "   " })).status).toBe(400);
  expect(
    (
      await put(
        {
          ...record,
          title: "Test",
          tecnico: "Ana",
          clienteUbicacion: "Zona",
          descripcionProblema: "Test",
          estado: "invalid",
          priority: "alta",
        },
        "reports",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await put(
        {
          ...record,
          clientId: recordId,
          technicianId: recordId,
          date: "2026-11-05",
          time: "99:99",
          status: "programada",
        },
        "visits",
      )
    ).status,
  ).toBe(400);
});
test("does not report a write as successful on Vercel without persistent storage", async () => {
  process.env.VERCEL = "1";
  const health = await request(app).get("/api/workspace/health");
  expect(health.body.storage).toBe("local-only");
  const response = await put(record);
  expect(response.status).toBe(503);
  delete process.env.VERCEL;
});
