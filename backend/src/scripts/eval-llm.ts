/**
 * LLM evaluation: runs 15 fixed inquiries through the real classification step (same prompt, same
 * Groq → Gemini fallback, same deterministic urgency rules as production) and prints what was
 * extracted. Clear cases assert the expected intent and urgency; ambiguous ones are printed only.
 *   npm run eval:llm            (from the repo root)
 */
import { classifyWithFallback } from '../pipeline/llm.js';
import { applyUrgencyRules, buildClassifyUserMessage, budgetText, mergeWithPrevious, type Intent, type Urgency } from '../pipeline/rules.js';
import { CLASSIFY_SYSTEM_PROMPT } from '../prompts/index.js';

interface Case {
  name: string;
  channel: 'web_chat' | 'whatsapp' | 'web_form';
  text: string;
  expect?: { intent?: Intent; urgency?: Urgency };
}

const CASES: Case[] = [
  { name: 'clear buyer', channel: 'web_chat', text: 'I want to buy a 3BHK apartment in Baner, Pune for my family. Budget up to 1.5 crore, planning to move in about 6 months.', expect: { intent: 'buyer', urgency: 'low' } },
  { name: 'clear renter', channel: 'web_chat', text: 'Looking for a 2BHK flat on rent in Powai, Mumbai. Budget 60-70k per month including maintenance, need it in 2 months.', expect: { intent: 'renter', urgency: 'medium' } },
  { name: 'clear investor', channel: 'web_chat', text: 'I want to invest in a pre-leased commercial office in Gurugram for rental yield of at least 7%. Budget around 4-5 Cr. No hurry.', expect: { intent: 'investor', urgency: 'low' } },
  { name: 'urgent relocation', channel: 'web_chat', text: 'Urgent! I am relocating to Hyderabad this week for work. Need a furnished 2BHK to rent near Gachibowli, max 35k/month.', expect: { intent: 'renter', urgency: 'high' } },
  { name: 'just browsing', channel: 'web_chat', text: 'Just browsing to see what is out there, nothing specific yet.', expect: { intent: 'unclear', urgency: 'low' } },
  { name: 'ambiguous', channel: 'web_chat', text: 'Do you have something in Bangalore?' },
  { name: 'Hinglish renter', channel: 'whatsapp', text: 'bhai mujhe Pune mein 1bhk chahiye rent pe, 15-18k tak budget, next month shift karna hai', expect: { intent: 'renter', urgency: 'high' } },
  { name: 'Hinglish buyer', channel: 'whatsapp', text: 'Hyderabad mein apna ghar lena hai, 2bhk flat, 90 lakh tak, 1 saal mein', expect: { intent: 'buyer', urgency: 'low' } },
  { name: 'WhatsApp short rent', channel: 'whatsapp', text: '2bhk rent whitefield 40k', expect: { intent: 'renter' } },
  { name: 'WhatsApp short buy', channel: 'whatsapp', text: 'plot sarjapur 1cr buy', expect: { intent: 'buyer' } },
  { name: 'investor multiple units', channel: 'web_form', text: 'I want to buy 3-4 studio apartments in Electronic City to rent out to IT employees. Looking at ROI and resale value. Budget 2 Cr total.', expect: { intent: 'investor' } },
  { name: 'named property ready budget', channel: 'web_chat', text: 'I am interested in the Palm Grove Villa in Whitefield. I have the budget of 3.2 Cr ready, can I see it?', expect: { intent: 'buyer', urgency: 'high' } },
  { name: 'commercial rent', channel: 'web_chat', text: 'Need a retail shop on lease in Koramangala for my cafe, around 1.5 lakh monthly rent, within 45 days.', expect: { intent: 'renter', urgency: 'medium' } },
  { name: 'contact details only', channel: 'web_chat', text: 'My name is Priya Sharma, you can reach me at priya.s@example.com' },
  { name: 'vague luxury', channel: 'whatsapp', text: 'sea facing flat mumbai?' },
];

async function main() {
  let pass = 0;
  let fail = 0;
  const started = Date.now();
  for (const c of CASES) {
    const user = buildClassifyUserMessage({ channel: c.channel, today: new Date().toISOString().slice(0, 10), history: [], latest: c.text, knownContact: {}, propertyContext: null });
    const t = Date.now();
    const r = await classifyWithFallback(CLASSIFY_SYSTEM_PROMPT, user);
    const ms = Date.now() - t;
    // Stay inside Groq's free-tier tokens-per-minute limit (≈1.7k tokens per classification).
    await new Promise((res) => setTimeout(res, Number(process.env.EVAL_DELAY_MS ?? 12000)));
    if (!r) {
      console.log(`✗ ${c.name}: both providers failed`);
      fail++;
      continue;
    }
    const cls = mergeWithPrevious(r.classification, null, {});
    const u = applyUrgencyRules(cls, { customerTexts: [c.text], repeatContactWithin24h: false });
    const problems: string[] = [];
    if (c.expect?.intent && cls.intent !== c.expect.intent) problems.push(`intent ${cls.intent} ≠ ${c.expect.intent}`);
    if (c.expect?.urgency && u.urgency !== c.expect.urgency) problems.push(`urgency ${u.urgency} ≠ ${c.expect.urgency}`);
    const asserted = Boolean(c.expect);
    const mark = !asserted ? '•' : problems.length ? '✗' : '✓';
    if (asserted) problems.length ? fail++ : pass++;
    console.log(`${mark} ${c.name.padEnd(28)} [${r.provider} ${ms}ms] intent=${cls.intent}(${cls.intent_confidence}) urgency=${u.urgency}${u.urgency !== u.llmUrgency ? ` (llm ${u.llmUrgency})` : ''}`);
    console.log(
      `    location=${JSON.stringify(cls.location.preferred)} budget="${budgetText(cls.budget)}" timeline="${cls.timeline.raw}"(${cls.timeline.days_estimate ?? '-'}d) type=${cls.property_requirements.type} beds=${cls.property_requirements.bedrooms ?? '-'} name=${cls.contact.name ?? '-'} email=${cls.contact.email ?? '-'}`,
    );
    console.log(`    missing=${cls.missing_fields.join(',') || '-'} | next_q: ${cls.next_question ?? '-'}`);
    if (problems.length) console.log(`    PROBLEM: ${problems.join('; ')}`);
  }
  console.log(`\n${pass}/${pass + fail} asserted cases passed · ${CASES.length} inquiries · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
