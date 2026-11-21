# Inventory & Data Management System

A RESTful backend API for managing products, inventory stock levels, filtering/sorting/pagination, low-stock alerts, and category-wise summary reports.

## Tech Stack

- **Node.js** (CommonJS)
- **Express.js** (`^5.3.0`)
- **MongoDB** & **Mongoose** (`^9.12.3`)
- **dotenv** (`^18.0.10`)

## Folder Structure

```text
.
├── config/
│   └── db.js
├── controllers/
│   └── productController.js
├── middleware/
│   ├── errorMiddleware.js
│   └── validateProduct.js
├── models/
│   └── Product.js
├── routes/
│   └── productRoutes.js
├── tests/
│   └── product.test.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Setup & Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your MongoDB connection string and port:
   ```env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/inventory_db
   ```

## Running the Server

- **Production:**
  ```bash
  npm start
  ```
- **Development (auto-reload):**
  ```bash
  npm run dev
  ```

## Running Tests

Run the built-in Node.js test suite (`node --test`):
```bash
npm test
```

> **Note:** `tests/product.test.js` runs isolated unit and HTTP tests using stubbed Mongoose model methods so it can execute without a live MongoDB server. Use Postman with a running MongoDB instance for end-to-end database testing.

---

## Postman API Testing Guide

Base URL: `http://localhost:5000`
Set header `Content-Type: application/json` for `POST`, `PUT`, and `PATCH` requests.

### 1. Create Product — `POST /api/products`
**Request Body:**
```json
{
  "name": "Wireless Mouse",
  "sku": "WM-101",
  "category": "Peripherals",
  "price": 29.99,
  "quantity": 12,
  "reorderLevel": 5,
  "supplier": "LogiTech Supply"
}
```
**Expected Response (`201 Created`):**
```json
{
  "success": true,
  "product": {
    "_id": "673f0a1b2c3d4e5f67890123",
    "name": "Wireless Mouse",
    "sku": "WM-101",
    "category": "Peripherals",
    "price": 29.99,
    "quantity": 12,
    "reorderLevel": 5,
    "supplier": "LogiTech Supply",
    "createdAt": "2026-11-21T15:00:00.000Z",
    "updatedAt": "2026-11-21T15:00:00.000Z",
    "stockValue": 359.88,
    "id": "673f0a1b2c3d4e5f67890123"
  }
}
```
- Duplicate `sku` returns `409 Conflict`:
  ```json
  {
    "success": false,
    "message": "Duplicate SKU: a product with this SKU already exists"
  }
  ```

---

### 2. List Products — `GET /api/products`
**Example URL:**
```text
http://localhost:5000/api/products?page=1&limit=10&category=Peripherals&search=mouse&sortBy=price&order=asc
```
**Query Parameters:**
- `page`: Page number (default `1`)
- `limit`: Items per page (default `10`, max `100`)
- `category`: Exact category filter
- `search`: Case-insensitive partial match on `name` or `sku` (regex-escaped)
- `sortBy`: Allowlisted field (`name`, `sku`, `category`, `price`, `quantity`, `reorderLevel`, `createdAt`, `updatedAt`)
- `order`: `asc` or `desc` (default `desc`)

**Expected Response (`200 OK`):**
```json
{
  "total": 1,
  "page": 1,
  "totalPages": 1,
  "count": 1,
  "products": [
    {
      "_id": "673f0a1b2c3d4e5f67890123",
      "name": "Wireless Mouse",
      "sku": "WM-101",
      "category": "Peripherals",
      "price": 29.99,
      "quantity": 12,
      "reorderLevel": 5,
      "supplier": "LogiTech Supply",
      "stockValue": 359.88,
      "id": "673f0a1b2c3d4e5f67890123"
    }
  ]
}
```

---

### 3. Get Product by ID — `GET /api/products/:id`
**Example URL:** `http://localhost:5000/api/products/673f0a1b2c3d4e5f67890123`

**Expected Response (`200 OK`):**
```json
{
  "success": true,
  "product": {
    "_id": "673f0a1b2c3d4e5f67890123",
    "name": "Wireless Mouse",
    "sku": "WM-101",
    "category": "Peripherals",
    "price": 29.99,
    "quantity": 12,
    "reorderLevel": 5,
    "stockValue": 359.88
  }
}
```
- Invalid ID returns `400 Bad Request`; missing ID returns `404 Not Found`.

---

### 4. Update Product — `PUT /api/products/:id`
**Request Body:**
```json
{
  "price": 24.99,
  "reorderLevel": 8
}
```
**Expected Response (`200 OK`):**
```json
{
  "success": true,
  "product": {
    "_id": "673f0a1b2c3d4e5f67890123",
    "name": "Wireless Mouse",
    "sku": "WM-101",
    "category": "Peripherals",
    "price": 24.99,
    "quantity": 12,
    "reorderLevel": 8,
    "stockValue": 299.88
  }
}
```

---

### 5. Delete Product — `DELETE /api/products/:id`
**Expected Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Product deleted successfully",
  "product": {
    "_id": "673f0a1b2c3d4e5f67890123",
    "name": "Wireless Mouse",
    "sku": "WM-101"
  }
}
```

---

### 6. Atomic Stock Adjustment — `PATCH /api/products/:id/stock`
**Request Body (Decrement by 3):**
```json
{
  "change": -3
}
```
**Expected Response (`200 OK`):**
```json
{
  "success": true,
  "product": {
    "_id": "673f0a1b2c3d4e5f67890123",
    "name": "Wireless Mouse",
    "sku": "WM-101",
    "quantity": 9,
    "stockValue": 224.91
  }
}
```
- Attempting to decrement below `0` returns `400 Bad Request`:
  ```json
  {
    "success": false,
    "message": "Insufficient stock: quantity cannot become negative"
  }
  ```

---

### 7. Low-Stock Report — `GET /api/products/low-stock`
**Expected Response (`200 OK`):**
```json
{
  "count": 1,
  "lowStockItems": [
    {
      "_id": "673f0a1b2c3d4e5f67890999",
      "name": "USB-C Hub",
      "sku": "HUB-01",
      "category": "Accessories",
      "price": 40,
      "quantity": 3,
      "reorderLevel": 5,
      "stockValue": 120
    }
  ]
}
```

---

### 8. Category Summary Aggregation — `GET /api/products/summary`
**Expected Response (`200 OK`):**
```json
{
  "categories": [
    {
      "_id": "Accessories",
      "totalItems": 1,
      "totalQuantity": 3,
      "totalStockValue": 120,
      "avgPrice": 40
    },
    {
      "_id": "Peripherals",
      "totalItems": 2,
      "totalQuantity": 15,
      "totalStockValue": 600,
      "avgPrice": 35
    }
  ],
  "summary": {
    "totalCategories": 2,
    "totalItems": 3,
    "totalQuantity": 18,
    "totalStockValue": 720,
    "avgPrice": 36.67
  }
}
```
