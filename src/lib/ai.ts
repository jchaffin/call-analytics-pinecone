import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { mistral } from '@ai-sdk/mistral';
import { google } from '@ai-sdk/google';

export const MODEL_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: {
      'gpt-4o-mini': { name: 'GPT-4o Mini', description: 'Fast & affordable' },
      'gpt-4o': { name: 'GPT-4o', description: 'Balanced performance' },
    }
  },
  anthropic: {
    name: 'Anthropic',
    models: {
      'claude-3-5-sonnet-latest': { name: 'Claude 3.5 Sonnet', description: 'Most intelligent, latest' },
      'claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet (Oct)', description: 'Previous Sonnet version' },
      'claude-3-5-haiku-latest': { name: 'Claude 3.5 Haiku', description: 'Fast & smart' },
      'claude-3-opus-latest': { name: 'Claude 3 Opus', description: 'Powerful, creative' },
      'claude-3-sonnet-20240229': { name: 'Claude 3 Sonnet', description: 'Balanced' },
      'claude-3-haiku-20240307': { name: 'Claude 3 Haiku', description: 'Fast & light' },
    }
  },
  mistral: {
    name: 'Mistral AI',
    models: {
      'mistral-large-latest': { name: 'Mistral Large', description: 'Most capable' },
      'mistral-medium-latest': { name: 'Mistral Medium', description: 'Balanced' },
      'mistral-small-latest': { name: 'Mistral Small', description: 'Fast & light' },
    }
  },
  google: {
    name: 'Google',
    models: {
      'gemini-1.5-pro-latest': { name: 'Gemini 1.5 Pro', description: 'Advanced reasoning' },
      'gemini-1.5-flash-latest': { name: 'Gemini 1.5 Flash', description: 'Fast multimodal' },
    }
  }
} as const;

// Type helpers
type ModelConfig = {
  [Provider in keyof typeof MODEL_PROVIDERS]: {
    [Model in keyof typeof MODEL_PROVIDERS[Provider]['models']]: Model;
  }
}[keyof typeof MODEL_PROVIDERS];

export type ModelId = ModelConfig[keyof ModelConfig];
export type Provider = keyof typeof MODEL_PROVIDERS;

// Get the first available model from providers (client-safe)
export function getDefaultModelId(): string {
  // Return the first model from the first provider
  const firstProvider = Object.values(MODEL_PROVIDERS)[0];
  const firstModel = Object.keys(firstProvider.models)[0];
  return firstModel;
}

// Get the default model for server-side use
export function getDefaultModel(): string {
  // Check if env variable is set
  if (process.env.OPENAI_MODEL) {
    return process.env.OPENAI_MODEL;
  }
  
  return getDefaultModelId();
}

export function getModel() {
  const modelName = getDefaultModel();
  return openai(modelName);
}

export function openModel(modelId: string) {
  // Find which provider has this model
  for (const [providerId, provider] of Object.entries(MODEL_PROVIDERS)) {
    if (modelId in provider.models) {
      switch (providerId) {
        case 'openai':
          return openai(modelId);
        case 'anthropic':
          return anthropic(modelId);
        case 'mistral':
          return mistral(modelId);
        case 'google':
          return google(modelId);
      }
    }
  }
  
  // Fallback to OpenAI if model not found
  return openai(modelId);
}