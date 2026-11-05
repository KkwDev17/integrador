const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const dataPath = process.env.REPORTS_DATA_PATH || path.join(__dirname, '../../data/reports.json');

// Asegurar que el archivo existe
const ensureDataFile = () => {
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
  }
};

// Leer reportes
const readReports = () => {
  ensureDataFile();
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error('Error al leer reportes');
  }
};

// Escribir reportes
const writeReports = (reports) => {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(reports, null, 2));
  } catch (error) {
    throw new Error('Error al guardar reporte');
  }
};

exports.getAllReports = (req, res, next) => {
  try {
    const reports = readReports();
    res.json({
      success: true,
      data: reports,
      count: reports.length
    });
  } catch (error) {
    next(error);
  }
};

exports.createReport = (req, res, next) => {
  try {
    const { tecnico, clienteUbicacion, descripcionProblema, estado, clientId } = req.body;

    // Validación de campos obligatorios
    const errors = [];
    if (typeof tecnico !== 'string' || tecnico.trim() === '') errors.push('El campo tecnico es obligatorio');
    if (typeof clienteUbicacion !== 'string' || clienteUbicacion.trim() === '') errors.push('El campo clienteUbicacion es obligatorio');
    if (typeof descripcionProblema !== 'string' || descripcionProblema.trim() === '') errors.push('El campo descripcionProblema es obligatorio');
    if (!['pendiente', 'en-proceso', 'completado'].includes(estado)) errors.push('El campo estado es inválido');
    if (clientId !== undefined && (typeof clientId !== 'string' || clientId.length > 100)) errors.push('clientId inválido');

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos obligatorios son requeridos',
        errors
      });
    }

    const reports = readReports();

    // Idempotencia (Semana 2): si llega clientId repetido, devolver el existente
    if (clientId) {
      const existing = reports.find((r) => r.clientId === clientId);
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Reporte ya registrado (idempotente)',
          data: existing
        });
      }
    }

    const newReport = {
      id: uuidv4(),
      ...(clientId ? { clientId } : {}),
      tecnico: tecnico.trim(),
      clienteUbicacion: clienteUbicacion.trim(),
      descripcionProblema: descripcionProblema.trim(),
      estado: estado.trim(),
      fechaCreacion: new Date().toISOString()
    };

    reports.push(newReport);
    writeReports(reports);

    res.status(201).json({
      success: true,
      message: 'Reporte registrado exitosamente',
      data: newReport
    });
  } catch (error) {
    next(error);
  }
};
