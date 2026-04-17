import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/error-handler.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import merchantRoutes from './routes/merchants.js';
import bookingRoutes from './routes/bookings.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use((req, _res, next) => {
    const start = Date.now();
    const originalEnd = _res.end.bind(_res);
    _res.end = function (...args: Parameters<typeof originalEnd>) {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[${req.method}] ${req.originalUrl} ${_res.statusCode} ${duration}ms`);
      }
      return originalEnd(...args);
    } as typeof _res.end;
    next();
  });

  app.use('/api/v1', healthRoutes);
  app.use('/api/v1', authRoutes);
  app.use('/api/v1', merchantRoutes);
  app.use('/api/v1', bookingRoutes);

  app.use(errorHandler);

  return app;
}
