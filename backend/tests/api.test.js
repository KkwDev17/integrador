const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fielddesk-legacy-test-'));
const dataPath = path.join(testDirectory, 'reports.json');
process.env.REPORTS_DATA_PATH = dataPath;
const app = require('../src/app');

describe('API REST - Reportes Técnicos', () => {
  beforeEach(() => {
    // Limpiar datos antes de cada prueba
    fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
  });

  afterAll(() => {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });

  test('GET /api/health debe retornar estado ok', async () => {
    const response = await request(app).get('/api/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.message).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });

  test('GET /api/reports debe retornar lista vacía inicialmente', async () => {
    const response = await request(app).get('/api/reports');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBe(0);
  });

  test('POST /api/reports debe registrar un reporte válido', async () => {
    const nuevoReporte = {
      tecnico: 'Carlos López',
      clienteUbicacion: 'Calle 45 #12-34',
      descripcionProblema: 'Revisión de aire acondicionado',
      estado: 'pendiente'
    };

    const response = await request(app)
      .post('/api/reports')
      .send(nuevoReporte)
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Reporte registrado exitosamente');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.tecnico).toBe(nuevoReporte.tecnico);
    expect(response.body.data.fechaCreacion).toBeDefined();
  });

  test('POST /api/reports debe rechazar datos incompletos', async () => {
    const reporteIncompleto = {
      tecnico: 'Ana Martínez'
    };

    const response = await request(app)
      .post('/api/reports')
      .send(reporteIncompleto)
      .set('Content-Type', 'application/json');

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBeDefined();
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test('GET /api/reports debe retornar reporte recién creado', async () => {
    const nuevoReporte = {
      tecnico: 'Luis Ramírez',
      clienteUbicacion: 'Km 5 Vía Rural',
      descripcionProblema: 'Falla eléctrica',
      estado: 'en-proceso'
    };

    await request(app).post('/api/reports').send(nuevoReporte);

    const response = await request(app).get('/api/reports');
    expect(response.statusCode).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].tecnico).toBe(nuevoReporte.tecnico);
  });

  test('Ruta no encontrada debe retornar 404', async () => {
    const response = await request(app).get('/api/ruta-inexistente');
    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('POST /api/reports con clientId repetido debe ser idempotente (Semana 2)', async () => {
    const reporte = {
      clientId: 'client-123',
      tecnico: 'Sync Test',
      clienteUbicacion: 'Zona Offline',
      descripcionProblema: 'Prueba idempotencia',
      estado: 'pendiente'
    };

    const first = await request(app).post('/api/reports').send(reporte);
    expect(first.statusCode).toBe(201);
    const second = await request(app).post('/api/reports').send(reporte);
    expect(second.statusCode).toBe(200);
    expect(second.body.message).toMatch(/idempotente/i);
    expect(second.body.data.clientId).toBe('client-123');

    const list = await request(app).get('/api/reports');
    const matches = list.body.data.filter((r) => r.clientId === 'client-123');
    expect(matches.length).toBe(1);
  });
});
