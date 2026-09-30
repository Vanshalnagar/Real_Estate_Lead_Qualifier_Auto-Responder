// Unit tests never touch real services: provide harmless placeholder config when .env is absent.
// (dotenv, loaded by config.ts, does not override variables that are already set.)
const defaults: Record<string, string> = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
  INTERNAL_API_SECRET: 'test-internal-secret-000000000000',
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD: 'test-password',
  JWT_SECRET: 'test-jwt-secret-0000000000000000000000',
  LOG_LEVEL: 'silent',
  NODE_ENV: 'test',
};
if (!process.env.INTEGRATION) {
  for (const [k, v] of Object.entries(defaults)) process.env[k] = v;
}
