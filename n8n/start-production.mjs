import { spawn } from 'node:child_process';
const env = { ...process.env };
if (env.NESTR_BACKEND_HOSTPORT) env.BACKEND_INTERNAL_URL = `http://${env.NESTR_BACKEND_HOSTPORT}`;
const child = spawn('n8n', ['start'], { stdio: 'inherit', env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
child.on('error', () => process.exit(1));
