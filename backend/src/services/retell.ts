import { config } from '../config.js';

export class VoiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const isPhone = (v: unknown): v is string => typeof v === 'string' && /^\+[1-9]\d{7,14}$/.test(v);

export function eligibility(lead: any, now = new Date()): string | null {
  if (!isPhone(lead.contact?.phone)) return 'A valid E.164 phone number is required';
  if (!lead.callConsent || !lead.callConsentAt || !lead.callConsentSource) return 'Recorded calling consent is required';
  if (lead.doNotCall) return 'Do Not Call is enabled';
  const allowed = config.RETELL_TEST_NUMBERS.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(lead.contact.phone)) return 'Number is outside the test allowlist';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour < config.VOICE_CALL_START_HOUR || hour >= config.VOICE_CALL_END_HOUR) return 'Outside calling hours (Asia/Kolkata)';
  if (lead.voiceLastAttemptAt && now.getTime() - new Date(lead.voiceLastAttemptAt).getTime() < 86400000) return 'A call was already attempted within 24 hours';
  return null;
}

export function callRequest(lead: any, attemptId: string) {
  const values: Record<string, unknown> = {
    customer_name: lead.contact?.name, customer_phone: lead.contact?.phone,
    lead_source: lead.channel, property_name: lead.propertyOfInterest,
    property_location: lead.location?.preferred?.join(', '),
    customer_inquiry: lead.summaryForBroker, budget: lead.budget?.raw || lead.budget?.max || lead.budget?.min,
  };
  return {
    from_number: config.RETELL_PHONE_NUMBER, to_number: lead.contact.phone,
    override_agent_id: config.RETELL_AGENT_ID, override_agent_version: 'latest_published',
    idempotency_key: attemptId,
    metadata: { leadId: String(lead._id), attemptId },
    retell_llm_dynamic_variables: Object.fromEntries(Object.entries(values).filter(([,v]) => v !== null && v !== undefined && v !== '').map(([k,v]) => [k,String(v)])),
  };
}

export async function retellRequest(path: string, method = 'GET', body?: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`https://api.retellai.com${path}`, {
      method, headers: { Authorization: `Bearer ${config.RETELL_API_KEY}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
  } catch { throw new VoiceError(502, 'Retell request outcome is unknown; inspect provider history before retrying'); }
  if (!response.ok) throw new VoiceError(502, `Retell rejected the request (HTTP ${response.status})`);
  return response.status === 204 ? {} : response.json();
}
