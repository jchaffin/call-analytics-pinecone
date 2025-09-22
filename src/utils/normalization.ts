import { FinalSchema, SuccessCategory, CallType } from '@/utils/schemas';

const callTypeMap: Record<string, CallType> = {
  automated: 'Automated',
  bot: 'Automated',
  ivr: 'Automated',
  ai: 'Automated',
  escalated: 'Escalated',
  escalation: 'Escalated',
  external: 'Escalated',
};

const successMap: Record<string, SuccessCategory> = {
  success: 'Successful',
  successful: 'Successful',
  pass: 'Successful',
  'partially successful': 'Partially Successful',
  partial: 'Partially Successful',
  partial_success: 'Partially Successful',
  'partial success': 'Partially Successful',
  fail: 'Unsuccessful',
  failed: 'Unsuccessful',
  unsuccessful: 'Unsuccessful',
};

export function normalizeCallType(value: string): CallType | undefined {
  const key = value.trim().toLowerCase();
  return callTypeMap[key as keyof typeof callTypeMap];
}

export function normalizeSuccessCategory(value: string): SuccessCategory | undefined {
  const key = value.trim().toLowerCase();
  return successMap[key as keyof typeof successMap];
}

export function normalizeFinal(result: unknown) {
  if (typeof result !== 'object' || result === null) return undefined;
  const obj: any = { ...result };
  if (typeof obj.callType === 'string') {
    obj.callType = normalizeCallType(obj.callType) ?? obj.callType;
  }
  if (typeof obj.successCategory === 'string') {
    obj.successCategory = normalizeSuccessCategory(obj.successCategory) ?? obj.successCategory;
  }
  if (typeof obj.intent === 'string') obj.intent = obj.intent.trim();
  if (typeof obj.intentCategory === 'string') obj.intentCategory = obj.intentCategory.trim();
  if (typeof obj.summary === 'string') obj.summary = obj.summary.trim();
  if (Array.isArray(obj.keyPoints)) obj.keyPoints = obj.keyPoints.map((k: unknown) => String(k).trim()).filter(Boolean);
  if (Array.isArray(obj.actionItems)) obj.actionItems = obj.actionItems.map((k: unknown) => String(k).trim()).filter(Boolean);
  if (Array.isArray(obj.products)) {
    obj.products = obj.products
      .map((p: any) => ({ id: String(p.id), name: String(p.name ?? p.id), score: clamp01(Number(p.score ?? 0)) }))
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

