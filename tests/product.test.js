const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { validateProductPayload } = require('../middleware/validateProduct');
const { errorHandler } = require('../middleware/errorMiddleware');
const { app } = require('../server');

describe('Product Schema & Virtuals', () => {
  it('validates a complete product, trims strings, applies defaults, and computes stockValue', async () => {
    const product = new Product({
      name: '  Mechanical Keyboard  ',
      sku: '  KB-202  ',
      category: '  Peripherals  ',
      price: 75.5,
      quantity: 4,
    });

    await product.validate();
    const json = product.toJSON();

    assert.equal(json.name, 'Mechanical Keyboard');
    assert.equal(json.sku, 'KB-202');
    assert.equal(json.category, 'Peripherals');
    assert.equal(json.quantity, 4);
    assert.equal(json.reorderLevel, 5);
    assert.equal(json.stockValue, 302);
  });

  it('rejects negative price, non-integer quantity, and missing required fields', async () => {
    const invalid = new Product({
      price: -10,
      quantity: 2.5,
      reorderLevel: -1,
    });

    await assert.rejects(invalid.validate(), (err) => {
      assert.ok(err.errors.name);
      assert.ok(err.errors.sku);
      assert.ok(err.errors.category);
      assert.ok(err.errors.price);
      assert.ok(err.errors.quantity);
      assert.ok(err.errors.reorderLevel);
      return true;
    });
  });
});

describe('Validation & Error Middleware', () => {
  it('validates create and update payloads', () => {
    const createErrors = validateProductPayload({ name: 'Item' }, { isUpdate: false });
    assert.ok(createErrors.length >= 3);

    const emptyUpdateErrors = validateProductPayload({}, { isUpdate: true });
    assert.deepEqual(emptyUpdateErrors, ['At least one product field must be provided for update']);

    const validUpdateErrors = validateProductPayload({ price: 19.99 }, { isUpdate: true });
    assert.deepEqual(validUpdateErrors, []);
  });

  it('maps duplicate key error (11000) to 409', () => {
    let statusCode = null;
    let payload = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        payload = body;
      },
    };

    errorHandler({ code: 11000, keyPattern: { sku: 1 } }, {}, res, () => {});
    assert.equal(statusCode, 409);
    assert.equal(payload.success, false);
    assert.match(payload.message, /Duplicate sku/i);
  });
});

describe('Product REST API Endpoints (Isolated HTTP Tests)', () => {
  let server;
  let baseUrl;
  const sampleId = new mongoose.Types.ObjectId().toString();
  const missingId = new mongoose.Types.ObjectId().toString();

  const originals = {
    create: Product.create,
    countDocuments: Product.countDocuments,
    find: Product.find,
    findById: Product.findById,
    findByIdAndUpdate: Product.findByIdAndUpdate,
    findByIdAndDelete: Product.findByIdAndDelete,
    findOneAndUpdate: Product.findOneAndUpdate,
    exists: Product.exists,
    aggregate: Product.aggregate,
  };

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api/products`;
        resolve();
      });
    });
  });

  after(async () => {
    Object.assign(Product, originals);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    const sampleDoc = new Product({
      _id: sampleId,
      name: 'USB-C Hub',
      sku: 'HUB-01',
      category: 'Accessories',
      price: 40,
      quantity: 3,
      reorderLevel: 5,
    });

    Product.create = async (data) => {
      if (data.sku === 'DUP-SKU') {
        const err = new Error('E11000 duplicate key');
        err.code = 11000;
        throw err;
      }
      return new Product({ _id: sampleId, ...data });
    };

    Product.countDocuments = async () => 1;

    Product.find = (filter = {}) => {
      const result = filter.$expr ? [sampleDoc] : [sampleDoc];
      return {
        sort() {
          return {
            skip() {
              return {
                limit: async () => result,
              };
            },
            then(resolve, reject) {
              return Promise.resolve(result).then(resolve, reject);
            },
          };
        },
      };
    };

    Product.findById = async (id) => (id === sampleId ? sampleDoc : null);

    Product.findByIdAndUpdate = async (id, data) => {
      if (id !== sampleId) return null;
      return new Product({ ...sampleDoc.toObject(), ...data });
    };

    Product.findByIdAndDelete = async (id) => (id === sampleId ? sampleDoc : null);

    Product.findOneAndUpdate = async (filter, update) => {
      if (filter._id !== sampleId) return null;
      const change = update.$inc.quantity;
      if (filter.quantity && filter.quantity.$gte > sampleDoc.quantity) {
        return null;
      }
      return new Product({
        ...sampleDoc.toObject(),
        quantity: sampleDoc.quantity + change,
      });
    };

    Product.exists = async ({ _id }) => (_id === sampleId ? { _id } : null);

    Product.aggregate = async () => [
      {
        _id: 'Accessories',
        totalItems: 1,
        totalQuantity: 3,
        totalStockValue: 120,
        avgPrice: 40,
      },
    ];
  });

  it('POST /api/products creates a product (201) and handles duplicate SKU (409)', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'USB-C Hub',
        sku: 'HUB-01',
        category: 'Accessories',
        price: 40,
        quantity: 3,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.product.stockValue, 120);

    const dupRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'USB-C Hub',
        sku: 'DUP-SKU',
        category: 'Accessories',
        price: 40,
      }),
    });
    assert.equal(dupRes.status, 409);
  });

  it('GET /api/products applies category filter, escaped search, allowlisted sort, and capped pagination metadata', async () => {
    let capturedFilter = null;
    let capturedSort = null;
    let capturedSkip = null;
    let capturedLimit = null;

    Product.countDocuments = async (filter) => {
      capturedFilter = filter;
      return 25;
    };

    Product.find = (filter) => {
      capturedFilter = filter;
      return {
        sort(sortObj) {
          capturedSort = sortObj;
          return {
            skip(skipVal) {
              capturedSkip = skipVal;
              return {
                limit: async (limitVal) => {
                  capturedLimit = limitVal;
                  return [new Product({ _id: sampleId, name: 'USB-C Hub', sku: 'HUB-01', category: 'Accessories', price: 40, quantity: 3 })];
                },
              };
            },
          };
        },
      };
    };

    const res = await fetch(
      `${baseUrl}?page=2&limit=500&category=Accessories&search=hub(1)&sortBy=price&order=asc`
    );
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.total, 25);
    assert.equal(body.page, 2);
    assert.equal(body.totalPages, 1);
    assert.equal(body.count, 1);
    assert.equal(body.products.length, 1);

    assert.equal(capturedFilter.category, 'Accessories');
    assert.equal(capturedFilter.$or.length, 2);
    assert.equal(capturedFilter.$or[0].name.source, 'hub\\(1\\)');
    assert.deepEqual(capturedSort, { price: 1 });
    assert.equal(capturedSkip, 100);
    assert.equal(capturedLimit, 100);

    // Disallowed sortBy falls back to createdAt desc
    const fallbackRes = await fetch(`${baseUrl}?sortBy=__proto__&order=invalid`);
    assert.equal(fallbackRes.status, 200);
    assert.deepEqual(capturedSort, { createdAt: -1 });
  });

  it('GET /api/products/low-stock and /summary resolve before /:id and compute expected results from sample data', async () => {
    const dataset = [
      new Product({ _id: sampleId, name: 'USB-C Hub', sku: 'HUB-01', category: 'Accessories', price: 40, quantity: 3, reorderLevel: 5 }),
      new Product({ name: 'Mouse', sku: 'M-01', category: 'Peripherals', price: 20, quantity: 5, reorderLevel: 5 }),
      new Product({ name: 'Keyboard', sku: 'KB-01', category: 'Peripherals', price: 50, quantity: 10, reorderLevel: 5 }),
    ];

    Product.find = (filter = {}) => {
      const items = filter.$expr
        ? dataset.filter((p) => p.quantity < p.reorderLevel)
        : dataset;
      return {
        sort: async () => items,
      };
    };

    let capturedPipeline = null;
    Product.aggregate = async (pipeline) => {
      capturedPipeline = pipeline;
      return [
        { _id: 'Accessories', totalItems: 1, totalQuantity: 3, totalStockValue: 120, avgPrice: 40 },
        { _id: 'Peripherals', totalItems: 2, totalQuantity: 15, totalStockValue: 600, avgPrice: 35 },
      ];
    };

    const lowStockRes = await fetch(`${baseUrl}/low-stock`);
    assert.equal(lowStockRes.status, 200);
    const lowStockBody = await lowStockRes.json();
    assert.equal(lowStockBody.count, 1);
    assert.equal(lowStockBody.lowStockItems.length, 1);
    assert.equal(lowStockBody.lowStockItems[0].sku, 'HUB-01');

    const summaryRes = await fetch(`${baseUrl}/summary`);
    assert.equal(summaryRes.status, 200);
    const summaryBody = await summaryRes.json();
    assert.equal(capturedPipeline[0].$group._id, '$category');
    assert.equal(summaryBody.categories.length, 2);
    assert.equal(summaryBody.summary.totalCategories, 2);
    assert.equal(summaryBody.summary.totalItems, 3);
    assert.equal(summaryBody.summary.totalQuantity, 18);
    assert.equal(summaryBody.summary.totalStockValue, 720);
    assert.equal(summaryBody.summary.avgPrice, 36.67);
  });

  it('PATCH /api/products/:id/stock applies atomic adjustments and blocks negative stock', async () => {
    const okRes = await fetch(`${baseUrl}/${sampleId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: 5 }),
    });
    assert.equal(okRes.status, 200);
    const okBody = await okRes.json();
    assert.equal(okBody.product.quantity, 8);
    assert.equal(okBody.product.stockValue, 320);

    const exactZeroRes = await fetch(`${baseUrl}/${sampleId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: -3 }),
    });
    assert.equal(exactZeroRes.status, 200);
    const zeroBody = await exactZeroRes.json();
    assert.equal(zeroBody.product.quantity, 0);
    assert.equal(zeroBody.product.stockValue, 0);

    const negRes = await fetch(`${baseUrl}/${sampleId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: -10 }),
    });
    assert.equal(negRes.status, 400);

    const badInputRes = await fetch(`${baseUrl}/${sampleId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: 1.5 }),
    });
    assert.equal(badInputRes.status, 400);

    const missingRes = await fetch(`${baseUrl}/${missingId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: 1 }),
    });
    assert.equal(missingRes.status, 404);
  });

  it('GET / PUT / DELETE /api/products/:id return expected formats and handle errors', async () => {
    const getRes = await fetch(`${baseUrl}/${sampleId}`);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.success, true);
    assert.equal(getBody.product.sku, 'HUB-01');
    assert.equal(getBody.product.stockValue, 120);

    const missingGetRes = await fetch(`${baseUrl}/${missingId}`);
    assert.equal(missingGetRes.status, 404);

    const putRes = await fetch(`${baseUrl}/${sampleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 50, reorderLevel: 8 }),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.success, true);
    assert.equal(putBody.product.price, 50);
    assert.equal(putBody.product.stockValue, 150);

    const emptyPutRes = await fetch(`${baseUrl}/${sampleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(emptyPutRes.status, 400);

    const deleteRes = await fetch(`${baseUrl}/${sampleId}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);
    const deleteBody = await deleteRes.json();
    assert.equal(deleteBody.success, true);
    assert.equal(deleteBody.message, 'Product deleted successfully');
    assert.equal(deleteBody.product.sku, 'HUB-01');

    const missingDeleteRes = await fetch(`${baseUrl}/${missingId}`, { method: 'DELETE' });
    assert.equal(missingDeleteRes.status, 404);
  });

  it('returns 400 for malformed JSON and invalid product IDs', async () => {
    const badJsonRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    assert.equal(badJsonRes.status, 400);

    const badIdRes = await fetch(`${baseUrl}/invalid-id`);
    assert.equal(badIdRes.status, 400);
  });
});
