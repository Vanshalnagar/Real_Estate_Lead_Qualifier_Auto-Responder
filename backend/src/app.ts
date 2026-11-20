import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { dbState } from './db/connect.js';
import { logger } from './logger.js';
import { adminRouter } from './http/adminRoutes.js';
import { authRouter } from './http/authRoutes.js';
import { internalRouter } from './http/internalRoutes.js';
import { errorHandler } from './http/middleware.js';
import { publicRouter } from './http/publicRoutes.js';
import { webhookRouter } from './http/webhookRoutes.js';
import { retellWebhook } from './http/voiceRoutes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.post('/api/webhooks/retell', express.raw({ type: 'application/json', limit: '5mb' }), retellWebhook);
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/admin') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.header('origin');
      if ((origin && !config.CORS_ORIGIN.split(',').map(s => s.trim()).includes(origin)) || (!origin && req.headers.cookie)) return res.status(403).json({ ok: false, error: 'Untrusted request origin' });
    }
    next();
  });
  app.use(
    express.json({
      limit: '200kb',
      // Keep the raw bytes for WhatsApp signature verification.
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' || req.url?.startsWith('/api/admin/events') === true },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url?.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.status(dbState() === 'up' ? 200 : 503).json({ ok: dbState() === 'up', db: dbState() }));
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/webhooks', webhookRouter);
  app.use('/api/internal', internalRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not found' }));
  app.use(errorHandler);
  return app;
}
