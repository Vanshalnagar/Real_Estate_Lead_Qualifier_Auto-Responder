import { z } from 'zod';

const nullableNum = z.number().finite().nullable();

/** Strict schema for the classification JSON (Section 6.1), applied after `normalizeClassification`. */
export const classificationSchema = z
  .object({
    intent: z.enum(['buyer', 'renter', 'investor', 'unclear']),
    intent_confidence: z.number().min(0).max(1),
    urgency: z.enum(['high', 'medium', 'low']),
    urgency_reason: z.string(),
    location: z.object({ preferred: z.array(z.string()), flexible: z.boolean() }),
    budget: z.object({
      min: nullableNum,
      max: nullableNum,
      currency: z.string(),
      period: z.enum(['total', 'monthly']).nullable(),
      raw: z.string(),
    }),
    timeline: z.object({ raw: z.string(), days_estimate: nullableNum }),
    property_requirements: z.object({
      type: z.enum(['apartment', 'villa', 'plot', 'commercial', 'other']).nullable(),
      bedrooms: nullableNum,
      bathrooms: nullableNum,
      area_sqft: nullableNum,
      furnishing: z.string().nullable(),
      amenities: z.array(z.string()),
      other: z.array(z.string()),
    }),
    contact: z.object({
      name: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().email().nullable(),
    }),
    property_of_interest: z.string().nullable(),
    missing_fields: z.array(z.string()),
    summary_for_broker: z.string(),
    next_question: z.string().nullable(),
  })
  .strict();

export type ClassificationZ = z.infer<typeof classificationSchema>;
