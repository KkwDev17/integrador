const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const cors = require('cors');
const reportsRoutes = require('./routes/reports.routes');
const errorHandler = require('./middleware/errorHandler');
const workspaceRoutes = require('./routes/workspace.routes');

const app = express();

// Configuración CORS
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: corsOrigin.split(',').map(o => o.trim()),
  credentials: true
}));

// Middlewares
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.urlencoded({ extended: true }));

// Rutas
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Servicio de reportes técnicos funcionando',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/workspace', workspaceRoutes);
// Legacy file-based endpoints remain available only on the local development server.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') app.use('/api/reports', reportsRoutes);

// Render serves the React build and the API under one origin.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
    app.use('/assets', express.static(path.join(frontendPath, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(frontendPath, { maxAge: 0 }));
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
}

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Manejo centralizado de errores
app.use(errorHandler);

module.exports = app;
