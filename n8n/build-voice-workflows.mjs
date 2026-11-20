import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const credential = { httpHeaderAuth: { id: 'nestrCredIntrnl1', name: 'Backend Internal Secret' } };
for (const [id, name, path, url, method] of [
  ['nestrVoiceOutbound1', 'Voice — Outbound Lead Calling', 'voice-outbound', '/api/internal/voice/calls', 'POST'],
  ['nestrVoiceFollowup1', 'Voice — Post-call Follow-up', 'voice-followup', '/api/internal/voice/calls/{{ $json.call._id }}/followup', 'POST'],
]) {
  const outbound = path === 'voice-outbound';
  const nodes = [
    { id: 'trigger', name: 'Authenticated notification', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0,0], webhookId: id, credentials: credential, parameters: { httpMethod: 'POST', path, authentication: 'headerAuth', responseMode: 'lastNode', options: {} } },
    ...(!outbound ? [{ id: 'get', name: 'Retrieve authoritative call', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260,0], credentials: credential, parameters: { url: '={{ $env.BACKEND_INTERNAL_URL }}/api/internal/voice/calls/{{ $json.body.callId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { timeout: 15000 } } }] : []),
    { id: 'apply', name: outbound ? 'Backend validates consent DNC and duplicates' : 'Apply category and broker follow-up idempotently', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [520,0], credentials: credential, parameters: { method, url: `={{ $env.BACKEND_INTERNAL_URL }}${url}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: outbound ? '={{ JSON.stringify({ leadId: $json.body.leadId }) }}' : '={}', options: { timeout: 20000 } } },
  ];
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++) connections[nodes[i].name] = { main: [[{ node: nodes[i+1].name, type: 'main', index: 0 }]] };
  const workflow = { id, name, active: false, nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata', errorWorkflow: 'nestrErrorHndlr1' }, pinData: {}, tags: [] };
  workflow.versionId = createHash('sha256').update(JSON.stringify(workflow)).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  writeFileSync(new URL(`./workflows/${path}.json`, import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
}
console.log('Two voice workflows generated; existing intake workflows were not changed.');
