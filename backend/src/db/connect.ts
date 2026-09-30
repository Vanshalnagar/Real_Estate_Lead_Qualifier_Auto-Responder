import mongoose from 'mongoose';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Host part of the URI only, so logs never contain credentials. */
export function describeMongoUri(uri: string): string {
  const m = uri.match(/^mongodb(\+srv)?:\/\/(?:[^@/]+@)?([^/?]+)/);
  if (!m) return 'mongodb';
  const firstHost = m[2].split(',')[0];
  return `${m[1] ? 'mongodb+srv' : 'mongodb'}://${firstHost}${m[2].includes(',') ? ',…' : ''}`;
}

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB, serverSelectionTimeoutMS: 15000 });
  logger.info({ host: describeMongoUri(config.MONGODB_URI), db: config.MONGODB_DB }, 'MongoDB connected');
}

export function dbState(): 'up' | 'down' {
  return mongoose.connection.readyState === 1 ? 'up' : 'down';
}
