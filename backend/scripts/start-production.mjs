// Render private-network host:port references are joined only on the server.
if (process.env.NESTR_N8N_HOSTPORT) {
  const base = `http://${process.env.NESTR_N8N_HOSTPORT}`;
  process.env.N8N_WEBHOOK_URL = `${base}/webhook/lead-intake`;
  process.env.N8N_HEALTH_URL = `${base}/healthz`;
  process.env.N8N_VOICE_FOLLOWUP_URL = `${base}/webhook/voice-followup`;
  process.env.N8N_VOICE_OUTBOUND_URL = `${base}/webhook/voice-outbound`;
}
await import('../dist/server.js');
