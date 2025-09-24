import { z } from 'zod';
import { FinalSchema, SuccessCategory, CallType } from '@/utils/schemas';

// Zod schema for normalizing call types
export const NormalizedCallTypeSchema = z.string().transform((val) => {
  const normalized = val.trim().toLowerCase();
  const callTypeMap: Record<string, CallType> = {
    automated: 'Automated',
    bot: 'Automated',
    ivr: 'Automated',
    ai: 'Automated',
    escalated: 'Escalated',
    escalation: 'Escalated',
    external: 'Escalated',
    human: 'Escalated',
    agent: 'Escalated',
  };
  return callTypeMap[normalized] || val;
});

// Zod schema for normalizing success categories (simple pattern-based)
export const NormalizedSuccessCategorySchema = z.string().transform((val) => {
  const s = val.trim().toLowerCase();
  const compact = s.replace(/[_\s-]+/g, ' ');
  if (/(partial|partially)/.test(compact)) return 'Partially Successful';
  if (/(success|passed|pass|ok|resolved)/.test(compact)) return 'Successful';
  if (/(fail|unsuccess)/.test(compact)) return 'Unsuccessful';
  return val;
});


export const NormalizedIntentSchema = z.string().transform((val) => {
  // Just clean up the intent string
  return val.trim();
});

// Helper functions for backward compatibility
export function normalizeCallType(value: string): CallType | undefined {
  try {
    return NormalizedCallTypeSchema.parse(value) as CallType;
  } catch {
    return undefined;
  }
}

export function normalizeSuccessCategory(value: string): SuccessCategory | undefined {
  try {
    return NormalizedSuccessCategorySchema.parse(value) as SuccessCategory;
  } catch {
    return undefined;
  }
}

export function normalizeFinal(result: unknown) {
  if (typeof result !== 'object' || result === null) return undefined;
  const obj: any = { ...result };
  
  // Normalize call type using Zod schema
  if (typeof obj.callType === 'string') {
    try {
      obj.callType = NormalizedCallTypeSchema.parse(obj.callType);
    } catch {
      // Keep original if normalization fails
    }
  }
  
  // Normalize success category using Zod schema
  if (typeof obj.successCategory === 'string') {
    try {
      obj.successCategory = NormalizedSuccessCategorySchema.parse(obj.successCategory);
    } catch {
      // Keep original if normalization fails
    }
  }
  
  // Normalize intent using Zod schema
  if (typeof obj.intent === 'string') {
    try {
      obj.intent = NormalizedIntentSchema.parse(obj.intent);
    } catch {
      obj.intent = obj.intent.trim();
    }
  }
  
  if (typeof obj.intentCategory === 'string') obj.intentCategory = obj.intentCategory.trim();
  if (typeof obj.summary === 'string') obj.summary = obj.summary.trim();
  if (Array.isArray(obj.keyPoints)) obj.keyPoints = obj.keyPoints.map((k: unknown) => String(k).trim()).filter(Boolean);
  if (Array.isArray(obj.actionItems)) obj.actionItems = obj.actionItems.map((k: unknown) => String(k).trim()).filter(Boolean);
  if (Array.isArray(obj.products)) {
    obj.products = obj.products
      .map((p: any) => ({
        id: String(p.id),
        name: String(p.name ?? p.id),
        score: clamp01(Number(p.score ?? 0)),
        brand: p.brand ? String(p.brand) : undefined,
        category: p.category ? String(p.category) : undefined
      }))
      .filter((p: any) => p.id && p.name);
  }
  if (Array.isArray(obj.keywords)) {
    obj.keywords = obj.keywords
      .map((k: any) => ({ term: String(k.term ?? k), score: clamp01(Number(k.score ?? 0)) }))
      .filter((k: any) => k.term);
  }
  if (Array.isArray(obj.relatedDocs)) {
    obj.relatedDocs = obj.relatedDocs
      .map((d: any) => ({ id: String(d.id), score: Number(d.score ?? 0), metadata: d.metadata }))
      .filter((d: any) => d.id);
  }
  if (typeof obj.confidence === 'number') {
    obj.confidence = Math.max(0, Math.min(1, obj.confidence));
  }
  const parsed = FinalSchema.safeParse(obj);
  if (!parsed.success) return undefined;
  return parsed.data;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

