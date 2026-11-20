import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { VoiceCall, VoiceEvent, VoiceNumberLock } from './db/voice.js';
import { startVoiceWorker } from './services/voice.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb } from './db/connect.js';
import { Admin } from './db/models.js';
import { logger } from './logger.js';
import { startApifyScheduler } from './services/apify.js';

/** Seeds the single admin account from ADMIN_EMAIL / ADMIN_PASSWORD (password re-hashed if it changed). */
async function ensureAdmin() {
  const email = config.ADMIN_EMAIL.toLowerCase();
  const existing = await Admin.findOne({ email });
  if (existing && (await bcrypt.compare(config.ADMIN_PASSWORD, existing.passwordHash))) return;
  const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12);
  await Admin.updateOne({ email }, { $set: { email, passwordHash } }, { upsert: true });
  logger.info({ email }, existing ? 'admin password updated from .env' : 'admin account seeded');
}

async function main() {
  await connectDb();
  await ensureAdmin();
  await Promise.all([VoiceCall.init(), VoiceEvent.init(), VoiceNumberLock.init()]);
  const stopVoice = startVoiceWorker();
  startApifyScheduler();
  const app = createApp();
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    logger.info(
      { port: config.PORT, n8n: config.N8N_ENABLED ? config.N8N_WEBHOOK_URL : 'disabled', whatsapp: config.WHATSAPP_PROVIDER },
      'NESTR. backend listening',
    );
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    stopVoice();
    server.close(() => { void mongoose.disconnect().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 20000).unref();
  });
}

main().catch((e) => {
  logger.fatal({ err: (e as Error).message }, 'backend failed to start');
  process.exit(1);
});
