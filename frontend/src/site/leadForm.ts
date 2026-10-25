import { z } from 'zod';

/** Mirrors backend/src/http/publicRoutes.ts leadFormSchema (validated on both sides). */
export const leadFormSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().email('Please enter a valid email').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{7,16}$/, 'Please enter a valid phone number'),
  intent: z.enum(['Buy', 'Rent', 'Invest'], { error: 'Choose buy, rent or invest' }),
  location: z.string().trim().min(2, 'Where are you looking?').max(120),
  budget: z.string().trim().max(60).optional().default(''),
  timeline: z.string().trim().max(60).optional().default(''),
  message: z.string().trim().max(1500).optional().default(''),
});
export type LeadForm = z.infer<typeof leadFormSchema>;

/** The template's hidden honeypot inputs, kept as-is. */
export const HONEYPOTS = ['website', 'company', 'subject', 'title', 'description', 'feedback', 'notes', 'details', 'remarks', 'comments'];
