const mongoose = require('mongoose');

const isNonNegativeInteger = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
};

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, 'Product SKU is required'],
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Product category is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price must be a non-negative number'],
    },
    quantity: {
      type: Number,
      default: 0,
      min: [0, 'Quantity must be a non-negative integer'],
      validate: isNonNegativeInteger,
    },
    reorderLevel: {
      type: Number,
      default: 5,
      min: [0, 'Reorder level must be a non-negative integer'],
      validate: isNonNegativeInteger,
    },
    supplier: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field: total monetary value of current stock for this product
productSchema.virtual('stockValue').get(function () {
  const price = typeof this.price === 'number' ? this.price : 0;
  const quantity = typeof this.quantity === 'number' ? this.quantity : 0;
  return Number((price * quantity).toFixed(2));
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
