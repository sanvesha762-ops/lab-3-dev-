const express = require('express');
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
  getInventorySummary,
} = require('../controllers/productController');
const {
  validateCreateProduct,
  validateUpdateProduct,
  validateStockAdjustment,
} = require('../middleware/validateProduct');

const router = express.Router();

// Specific GET routes must be defined before the dynamic /:id route
router.get('/low-stock', getLowStockProducts);
router.get('/summary', getInventorySummary);

router.route('/')
  .post(validateCreateProduct, createProduct)
  .get(getProducts);

router.patch('/:id/stock', validateStockAdjustment, adjustStock);

router.route('/:id')
  .get(getProductById)
  .put(validateUpdateProduct, updateProduct)
  .delete(deleteProduct);

module.exports = router;
