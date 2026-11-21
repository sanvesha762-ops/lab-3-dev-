const mongoose = require('mongoose');
const Product = require('../models/Product');

const SORTABLE_FIELDS = new Set([
  'name',
  'sku',
  'category',
  'price',
  'quantity',
  'reorderLevel',
  'createdAt',
  'updatedAt',
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Escape special regular expression characters in user-provided search strings.
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pick only allowed product fields from request body.
 */
const pickProductFields = (body) => {
  const allowedFields = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];
  const data = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }
  return data;
};

/**
 * Validate ObjectId and return a 400 error if malformed.
 */
const assertValidObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid product ID format');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * POST /api/products
 * Create a new product in inventory.
 */
const createProduct = async (req, res, next) => {
  try {
    const productData = pickProductFields(req.body);
    const product = await Product.create(productData);
    return res.status(201).json({
      success: true,
      product,
    });
  } catch (error) {
    // Explicitly handle duplicate SKU index violation
    if (error.code === 11000) {
      const dupError = new Error('Duplicate SKU: a product with this SKU already exists');
      dupError.statusCode = 409;
      return next(dupError);
    }
    return next(error);
  }
};

/**
 * GET /api/products
 * Retrieve products with filtering, search, sorting, and pagination.
 */
const getProducts = async (req, res, next) => {
  try {
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);

    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;

    const filter = {};

    if (typeof req.query.category === 'string' && req.query.category.trim().length > 0) {
      filter.category = req.query.category.trim();
    }

    if (typeof req.query.search === 'string' && req.query.search.trim().length > 0) {
      const safePattern = escapeRegex(req.query.search.trim());
      const searchRegex = new RegExp(safePattern, 'i');
      filter.$or = [{ name: searchRegex }, { sku: searchRegex }];
    }

    const sortBy =
      typeof req.query.sortBy === 'string' && SORTABLE_FIELDS.has(req.query.sortBy)
        ? req.query.sortBy
        : 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    const [total, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ [sortBy]: order })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      total,
      page,
      totalPages,
      count: products.length,
      products,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/products/:id
 * Retrieve a single product by ID.
 */
const getProductById = async (req, res, next) => {
  try {
    assertValidObjectId(req.params.id);
    const product = await Product.findById(req.params.id);

    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /api/products/:id
 * Update an existing product by ID and return the updated document.
 */
const updateProduct = async (req, res, next) => {
  try {
    assertValidObjectId(req.params.id);
    const updateData = pickProductFields(req.body);

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    if (error.code === 11000) {
      const dupError = new Error('Duplicate SKU: a product with this SKU already exists');
      dupError.statusCode = 409;
      return next(dupError);
    }
    return next(error);
  }
};

/**
 * DELETE /api/products/:id
 * Remove a product by ID.
 */
const deleteProduct = async (req, res, next) => {
  try {
    assertValidObjectId(req.params.id);
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      product,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/products/:id/stock
 * Atomically increment or decrement product quantity without allowing negative stock.
 */
const adjustStock = async (req, res, next) => {
  try {
    assertValidObjectId(req.params.id);
    const { change } = req.body;

    const filter = { _id: req.params.id };
    if (change < 0) {
      filter.quantity = { $gte: Math.abs(change) };
    }

    const product = await Product.findOneAndUpdate(
      filter,
      { $inc: { quantity: change } },
      { returnDocument: 'after', runValidators: true }
    );

    if (!product) {
      // Distinguish between missing product and insufficient stock
      if (change < 0) {
        const exists = await Product.exists({ _id: req.params.id });
        if (exists) {
          const stockError = new Error('Insufficient stock: quantity cannot become negative');
          stockError.statusCode = 400;
          return next(stockError);
        }
      }

      const notFoundError = new Error('Product not found');
      notFoundError.statusCode = 404;
      return next(notFoundError);
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/products/low-stock
 * Retrieve products whose quantity is strictly below reorderLevel.
 */
const getLowStockProducts = async (req, res, next) => {
  try {
    const lowStockItems = await Product.find({
      $expr: { $lt: ['$quantity', '$reorderLevel'] },
    }).sort({ quantity: 1 });

    return res.status(200).json({
      count: lowStockItems.length,
      lowStockItems,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/products/summary
 * Generate category-wise and overall inventory summary using MongoDB aggregation.
 */
const getInventorySummary = async (req, res, next) => {
  try {
    const categories = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalStockValue: {
            $sum: { $multiply: ['$price', '$quantity'] },
          },
          avgPrice: { $avg: '$price' },
        },
      },
      {
        $project: {
          _id: 1,
          totalItems: 1,
          totalQuantity: 1,
          totalStockValue: { $round: ['$totalStockValue', 2] },
          avgPrice: { $round: ['$avgPrice', 2] },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalItems = categories.reduce((sum, cat) => sum + cat.totalItems, 0);
    const totalQuantity = categories.reduce((sum, cat) => sum + cat.totalQuantity, 0);
    const totalStockValue = Number(
      categories.reduce((sum, cat) => sum + cat.totalStockValue, 0).toFixed(2)
    );
    const weightedPriceSum = categories.reduce(
      (sum, cat) => sum + cat.avgPrice * cat.totalItems,
      0
    );
    const avgPrice = totalItems > 0 ? Number((weightedPriceSum / totalItems).toFixed(2)) : 0;

    return res.status(200).json({
      categories,
      summary: {
        totalCategories: categories.length,
        totalItems,
        totalQuantity,
        totalStockValue,
        avgPrice,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
  getInventorySummary,
};
