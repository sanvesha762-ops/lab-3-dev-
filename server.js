const dotenv = require('dotenv');
const express = require('express');
const connectDB = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables from .env file
dotenv.config();

const app = express();

// Parse incoming JSON payloads
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Inventory Management API is running',
  });
});

// Product API routes
app.use('/api/products', productRoutes);

// 404 and centralized error handling
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;

/**
 * Connect to MongoDB and start the Express HTTP server.
 */
const startServer = async () => {
  await connectDB();
  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Start the server only when executed directly (allows importing app in tests)
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
