/**
 * Validate product fields for create (all required fields checked) or update (provided fields checked).
 * Returns an array of human-readable validation error strings.
 */
const validateProductPayload = (body, { isUpdate = false } = {}) => {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be a JSON object'];
  }

  const allowedFields = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];
  if (isUpdate) {
    const hasUpdatableField = allowedFields.some((field) => body[field] !== undefined);
    if (!hasUpdatableField) {
      errors.push('At least one product field must be provided for update');
    }
  }

  // Required string fields
  const requiredStrings = [
    { key: 'name', label: 'Product name' },
    { key: 'sku', label: 'Product SKU' },
    { key: 'category', label: 'Product category' },
  ];

  for (const { key, label } of requiredStrings) {
    const value = body[key];
    if (!isUpdate && (value === undefined || value === null)) {
      errors.push(`${label} is required`);
    } else if (value !== undefined) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push(`${label} must be a non-empty string`);
      }
    }
  }

  // Price: required non-negative finite number
  if (!isUpdate && (body.price === undefined || body.price === null)) {
    errors.push('Product price is required');
  } else if (body.price !== undefined) {
    if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) {
      errors.push('Price must be a non-negative number');
    }
  }

  // Optional non-negative integer fields
  const integerFields = [
    { key: 'quantity', label: 'Quantity' },
    { key: 'reorderLevel', label: 'Reorder level' },
  ];

  for (const { key, label } of integerFields) {
    const value = body[key];
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        errors.push(`${label} must be a non-negative integer`);
      }
    }
  }

  // Optional supplier string
  if (body.supplier !== undefined && body.supplier !== null && typeof body.supplier !== 'string') {
    errors.push('Supplier must be a string');
  }

  return errors;
};

/**
 * Middleware to validate POST /api/products request body.
 */
const validateCreateProduct = (req, res, next) => {
  const errors = validateProductPayload(req.body, { isUpdate: false });
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  return next();
};

/**
 * Middleware to validate PUT /api/products/:id request body.
 */
const validateUpdateProduct = (req, res, next) => {
  const errors = validateProductPayload(req.body, { isUpdate: true });
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }
  return next();
};

/**
 * Middleware to validate PATCH /api/products/:id/stock request body.
 */
const validateStockAdjustment = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['Request body must be a JSON object'],
    });
  }

  const { change } = req.body;
  if (typeof change !== 'number' || !Number.isInteger(change)) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['Stock change must be an integer'],
    });
  }

  return next();
};

module.exports = {
  validateProductPayload,
  validateCreateProduct,
  validateUpdateProduct,
  validateStockAdjustment,
};
