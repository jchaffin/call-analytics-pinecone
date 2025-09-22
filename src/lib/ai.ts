import { openai } from '@ai-sdk/openai';

export function getModel() {
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  return openai(modelName);
}

export function openModel(modelName: string) {
  return openai(modelName);
}

