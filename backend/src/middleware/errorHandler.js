const errorHandler = (err, req, res, next) => {
  if (process.env.NODE_ENV !== 'test') console.error('Error:', err.message);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.type === 'entity.parse.failed' ? 'JSON inválido' : err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
