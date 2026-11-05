const fs = require("node:fs");
const path = require("node:path");
const redisUrl = () =>
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = () =>
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const storageMode = () =>
  redisUrl() && redisToken()
    ? "redis"
    : process.env.VERCEL || (process.env.RENDER && !process.env.WORKSPACE_DATA_DIR)
      ? "local-only"
      : "file";
const dataDir = () =>
  process.env.WORKSPACE_DATA_DIR ||
  path.join(__dirname, "../../data/workspaces");
async function redis(command) {
  const response = await fetch(redisUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw Object.assign(
      new Error("El almacenamiento en nube no está disponible."),
      { statusCode: 503 },
    );
  return data.result;
}
function filePath(workspace) {
  return path.join(dataDir(), `${workspace}.json`);
}
async function list(workspace) {
  if (storageMode() === "local-only")
    throw Object.assign(
      new Error(
        "Base de datos no configurada. Los datos se conservan en el dispositivo.",
      ),
      { statusCode: 503 },
    );
  if (storageMode() === "redis")
    return ((await redis(["HVALS", `fielddesk:${workspace}`])) || []).map((r) =>
      JSON.parse(r),
    );
  const target = filePath(workspace);
  return fs.existsSync(target)
    ? JSON.parse(fs.readFileSync(target, "utf8"))
    : [];
}
async function put(workspace, record) {
  if (storageMode() === "redis") {
    // The compare and write happen atomically so stale retries cannot overwrite newer records.
    const script =
      "local old = redis.call('HGET', KEYS[1], ARGV[1]); if old and cjson.decode(old).updatedAt > ARGV[2] then return old end; redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]); return ARGV[3]";
    return JSON.parse(
      await redis([
        "EVAL",
        script,
        "1",
        `fielddesk:${workspace}`,
        record.id,
        record.updatedAt,
        JSON.stringify(record),
      ]),
    );
  }
  // File operations are synchronous through the whole read/modify/write to avoid lost updates in development.
  if (storageMode() === "local-only")
    throw Object.assign(new Error("Base de datos no configurada."), {
      statusCode: 503,
    });
  fs.mkdirSync(dataDir(), { recursive: true });
  const target = filePath(workspace);
  const records = fs.existsSync(target)
    ? JSON.parse(fs.readFileSync(target, "utf8"))
    : [];
  const index = records.findIndex((r) => r.id === record.id);
  if (index >= 0 && records[index].updatedAt > record.updatedAt)
    return records[index];
  if (index >= 0) records[index] = record;
  else records.push(record);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(records, null, 2));
  fs.renameSync(temp, target);
  return record;
}
module.exports = { storageMode, list, put };
