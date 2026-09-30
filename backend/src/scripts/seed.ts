import mongoose from 'mongoose';
import { SEED_BROKERS } from '../data/brokers.js';
import { connectDb } from '../db/connect.js';
import { Broker, Lead, Message, Property } from '../db/models.js';
import { logger } from '../logger.js';

/**
 * Seeds the brokers only. Properties are NOT seeded: the website shows live listings synced from
 * Apify (see src/services/apify.ts). Any old demo properties are deactivated.
 * `--reset-leads` also clears leads/messages (dev only).
 */
async function main() {
  await connectDb();
  for (const b of SEED_BROKERS) {
    await Broker.updateOne({ email: b.email }, { $set: { ...b, areas: [...b.areas], specialties: [...b.specialties], active: true } }, { upsert: true });
  }
  const demo = await Property.updateMany({ source: { $in: ['demo', null] } }, { $set: { active: false, source: 'demo' } });
  if (process.argv.includes('--reset-leads')) {
    await Lead.deleteMany({});
    await Message.deleteMany({});
    logger.warn('leads and messages cleared');
  }
  await Promise.all([Lead.syncIndexes(), Message.syncIndexes(), Property.syncIndexes()]);
  logger.info({ brokers: SEED_BROKERS.length, demoPropertiesDeactivated: demo.modifiedCount }, 'seed complete (live properties come from Apify)');
  await mongoose.disconnect();
}

main().catch((e) => {
  logger.fatal({ err: (e as Error).message }, 'seed failed');
  process.exit(1);
});
