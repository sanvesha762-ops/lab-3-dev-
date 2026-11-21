/**
 * Handle requests to undefined routes.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Centralized error-handling middleware returning consistent JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  // Malformed JSON payload from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON in request body',
    });
  }

  // Invalid MongoDB ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path || 'ID'} format`,
    });
  }

  // Mongoose schema validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((item) => item.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // MongoDB duplicate key error (e.g., unique SKU index)
  if (err.code === 11000) {
    const duplicatedField = err.keyPattern ? Object.keys(err.keyPattern)[0] : 'field';
    return res.status(409).json({
      success: false,
      message: `Duplicate ${duplicatedField}: a product with this ${duplicatedField} already exists`,
    });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
  });
};

module.exports = {
  notFound,
  errorHandler,
};
