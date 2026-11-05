const express = require("express");
const storage = require("../storage/workspace");
const router = express.Router();
const collections = ["reports", "clients", "technicians", "visits"];
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
router.get("/health", (req, res) =>
  res.json({ status: "ok", storage: storage.storageMode() }),
);
router.use((req, res, next) => {
  const workspace = req.get("X-Workspace-Id");
  if (!workspace || !uuid.test(workspace))
    return res
      .status(400)
      .json({ success: false, message: "Identificador de espacio inválido." });
  req.workspaceId = workspace;
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/", async (req, res, next) => {
  try {
    res.json({ success: true, data: await storage.list(req.workspaceId) });
  } catch (e) {
    next(e);
  }
});
router.put("/:collection/:id", async (req, res, next) => {
  try {
    const { collection, id } = req.params;
    if (!collections.includes(collection) || !/^[a-zA-Z\d-]{1,100}$/.test(id))
      return res
        .status(400)
        .json({ success: false, message: "Colección o ID inválido." });
    const input = req.body;
    if (!input || Array.isArray(input) || typeof input !== "object")
      return res
        .status(400)
        .json({ success: false, message: "Registro inválido." });
    const fields = [
      "name",
      "title",
      "tecnico",
      "clienteUbicacion",
      "descripcionProblema",
      "estado",
      "priority",
      "category",
      "scheduledAt",
      "resolution",
      "contact",
      "email",
      "phone",
      "address",
      "specialty",
      "status",
      "clientId",
      "technicianId",
      "date",
      "time",
      "notes",
      "createdAt",
      "updatedAt",
      "deleted",
    ];
    const record = { id, collection };
    for (const field of fields) {
      const value = input[field];
      if (value === undefined) continue;
      if (field === "deleted") {
        if (typeof value !== "boolean")
          throw Object.assign(new Error("Eliminación inválida."), {
            statusCode: 400,
          });
        record.deleted = value;
        continue;
      }
      if (
        typeof value !== "string" ||
        value.length >
          (["descripcionProblema", "resolution", "notes"].includes(field)
            ? 5000
            : 500)
      )
        return res
          .status(400)
          .json({ success: false, message: `Campo inválido: ${field}` });
      record[field] = value.trim();
    }
    if (
      !record.updatedAt ||
      Number.isNaN(Date.parse(record.updatedAt)) ||
      !record.createdAt ||
      Number.isNaN(Date.parse(record.createdAt))
    )
      return res
        .status(400)
        .json({ success: false, message: "Fechas inválidas." });
    record.updatedAt = new Date(record.updatedAt).toISOString();
    record.createdAt = new Date(record.createdAt).toISOString();
    if (!record.deleted) {
      const required =
        collection === "reports"
          ? ["title", "tecnico", "clienteUbicacion", "descripcionProblema"]
          : collection === "visits"
            ? ["name", "clientId", "technicianId", "date", "time"]
            : ["name"];
      if (required.some((f) => !record[f]))
        return res
          .status(400)
          .json({
            success: false,
            message: "Completa los campos obligatorios.",
          });
      if (
        collection === "reports" &&
        (!["pendiente", "en-proceso", "completado"].includes(record.estado) ||
          !["alta", "media", "baja"].includes(record.priority))
      )
        return res
          .status(400)
          .json({ success: false, message: "Estado o prioridad inválido." });
      if (
        collection === "technicians" &&
        !["disponible", "en-campo", "ausente"].includes(record.status)
      )
        return res
          .status(400)
          .json({ success: false, message: "Disponibilidad inválida." });
      if (
        collection === "visits" &&
        (!["programada", "realizada", "cancelada"].includes(record.status) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time) ||
          Number.isNaN(Date.parse(`${record.date}T${record.time}`)))
      )
        return res
          .status(400)
          .json({
            success: false,
            message: "Fecha, hora o estado de visita inválidos.",
          });
      if (record.scheduledAt && Number.isNaN(Date.parse(record.scheduledAt)))
        return res
          .status(400)
          .json({ success: false, message: "Fecha de atención inválida." });
    }
    const data = await storage.put(req.workspaceId, record);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
