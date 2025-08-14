/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * models.ts
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the GNU Affero General Public License, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { canAccessModel, getDefaultModelForPlan, findModelById } from '@/configs/ai-models'
import { env } from '@/env.mjs'
import { isProviderAvailable, getPrimaryProvider } from './providers'
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic'

// ============================================================================
// Model Configuration and Selection
// ============================================================================

/**
 * Dynamic model mapping based on available providers
 * Priority: OpenRouter > Azure > Anthropic > Databricks > XAI
 */
const getDynamicModelMapping = (): Record<string, string> => {
  const mapping: Record<string, string> = {}

  // OpenRouter models (highest priority)
  if (isProviderAvailable('openrouter')) {
    mapping['claude-3-5-sonnet'] = 'chat-model-reasoning-openrouter'
    mapping['claude-4-0-sonnet'] = 'chat-model-reasoning-claude'
    mapping['gemini-2-5-pro'] = 'chat-model-reasoning-google'
    mapping['gpt-4o'] = 'chat-model-reasoning-openrouter'
    mapping['gpt-4o-mini'] = 'chat-model-reasoning-openrouter'
  }

  // Azure models
  if (isProviderAvailable('azure')) {
    mapping['gpt-4-1'] = 'chat-model-reasoning-azure'
    mapping['gpt-4-1-mini'] = 'chat-model-reasoning-azure-mini'
    mapping['gpt-4-1-nano'] = 'chat-model-reasoning-azure-nano'
  }

  // Anthropic models
  if (isProviderAvailable('anthropic')) {
    mapping['claude-3-5-sonnet-direct'] = 'chat-model-reasoning-anthropic'
    mapping['claude-4-0-sonnet-direct'] = 'chat-model-reasoning-anthropic'
  }

  // Databricks models
  if (isProviderAvailable('databricks')) {
    mapping['databricks-claude-3-5-sonnet'] = 'chat-model-databricks-claude'
  }

  // XAI models
  if (isProviderAvailable('xai')) {
    mapping['grok-3-fast-beta'] = 'chat-model-reasoning-xai'
  }

  return mapping
}

/**
 * Get default models based on available providers
 */
const getDynamicDefaultModels = () => {
  const defaults = {
    FILE_EDIT: '',
    FALLBACK: '',
    FILE_EDIT_FALLBACK: '',
  }

  // Priority 1: OpenRouter for file editing (Claude 3.5 Sonnet)
  if (isProviderAvailable('openrouter')) {
    defaults.FILE_EDIT = 'chat-model-reasoning-openrouter'
    defaults.FALLBACK = 'chat-model-reasoning-openrouter'
    defaults.FILE_EDIT_FALLBACK = 'chat-model-reasoning-openrouter'
  }
  // Priority 2: Azure if OpenRouter not available
  else if (isProviderAvailable('azure')) {
    defaults.FILE_EDIT = 'chat-model-reasoning-azure-mini'
    defaults.FALLBACK = 'chat-model-reasoning-azure'
    defaults.FILE_EDIT_FALLBACK = 'chat-model-reasoning-azure-mini'
  }
  // Priority 3: Anthropic if neither OpenRouter nor Azure available
  else if (isProviderAvailable('anthropic')) {
    defaults.FILE_EDIT = 'chat-model-reasoning-anthropic'
    defaults.FALLBACK = 'chat-model-reasoning-anthropic'
    defaults.FILE_EDIT_FALLBACK = 'chat-model-reasoning-anthropic'
  }
  // Priority 4: Databricks as last resort
  else if (isProviderAvailable('databricks')) {
    defaults.FILE_EDIT = 'chat-model-databricks-claude'
    defaults.FALLBACK = 'chat-model-databricks-claude'
    defaults.FILE_EDIT_FALLBACK = 'chat-model-databricks-claude'
  }
  // Priority 5: XAI as final fallback
  else if (isProviderAvailable('xai')) {
    defaults.FILE_EDIT = 'chat-model-reasoning-xai'
    defaults.FALLBACK = 'chat-model-reasoning-xai'
    defaults.FILE_EDIT_FALLBACK = 'chat-model-reasoning-xai'
  }

  return defaults
}

/**
 * Validate model selection and provide helpful error messages
 */
const validateModelSelection = (
  userPlan: string,
  selectedModelId?: string,
  isFileEdit = false
): { isValid: boolean; error?: string; suggestion?: string } => {
  const MODEL_MAPPING = getDynamicModelMapping()
  const DEFAULT_MODELS = getDynamicDefaultModels()

  // Check if any models are available
  if (Object.keys(MODEL_MAPPING).length === 0) {
    return {
      isValid: false,
      error: 'No AI models available. Please check your AI provider configuration.',
      suggestion: 'Set OPENROUTER_API_KEY, AZURE_API_KEY, or ANTHROPIC_API_KEY environment variables.',
    }
  }

  // Check if default models are configured
  if (!DEFAULT_MODELS.FALLBACK) {
    return {
      isValid: false,
      error: 'No default AI models configured.',
      suggestion: 'Check your AI provider configuration and environment variables.',
    }
  }

  // If a specific model is selected, validate it
  if (selectedModelId) {
    if (!MODEL_MAPPING[selectedModelId]) {
      const availableModels = Object.keys(MODEL_MAPPING).join(', ')
      return {
        isValid: false,
        error: `Selected model '${selectedModelId}' is not available.`,
        suggestion: `Available models: ${availableModels}`,
      }
    }

    // Check plan access
    if (!canAccessModel(userPlan, selectedModelId)) {
      const requestedModel = findModelById(selectedModelId)
      return {
        isValid: false,
        error: `Access denied: ${requestedModel.name} requires ${requestedModel.requiredPlan} subscription.`,
        suggestion: `Current plan: ${userPlan}. Please upgrade your subscription.`,
      }
    }
  }

  return { isValid: true }
}

/**
 * Select and validate AI model with dynamic provider support
 */
export const selectModel = (
  userPlan: string,
  selectedModelId?: string,
  isFileEdit = false
): string => {
  const MODEL_MAPPING = getDynamicModelMapping()
  const DEFAULT_MODELS = getDynamicDefaultModels()

  // Validate model selection first
  const validation = validateModelSelection(userPlan, selectedModelId, isFileEdit)
  if (!validation.isValid) {
    const errorMessage = [
      validation.error,
      '',
      'AI Provider Status:',
      `  Primary Provider: ${getPrimaryProvider() || 'None'}`,
      `  Available Models: ${Object.keys(MODEL_MAPPING).length}`,
      '',
      'Troubleshooting:',
      '  1. Check your environment variables (OPENROUTER_API_KEY, AZURE_API_KEY, etc.)',
      '  2. Verify your subscription plan matches the required access level',
      '  3. Check the console for AI provider initialization errors',
      '',
      validation.suggestion,
    ].join('\n')

    throw new Error(errorMessage)
  }

  let modelToUse = selectedModelId

  if (isFileEdit) {
    modelToUse = DEFAULT_MODELS.FILE_EDIT
  } else if (!modelToUse) {
    const defaultModel = getDefaultModelForPlan(userPlan)
    modelToUse = defaultModel.id
  } else {
    // Strict access control for non-file-edit operations
    if (!canAccessModel(userPlan, modelToUse)) {
      const requestedModel = findModelById(modelToUse)
      throw new Error(`Access denied: ${requestedModel.name} requires ${requestedModel.requiredPlan} subscription. Current plan: ${userPlan}`)
    }
  }

  // Map the selected model to the actual provider model
  const mappedModel = MODEL_MAPPING[modelToUse]
  if (!mappedModel) {
    // Fallback to default model if mapping not found
    const fallbackModel = isFileEdit ? DEFAULT_MODELS.FILE_EDIT_FALLBACK : DEFAULT_MODELS.FALLBACK
    
    if (!fallbackModel) {
      throw new Error(
        'No fallback model available. This indicates a configuration issue with your AI providers.'
      )
    }
    
    console.warn(`[AI Models] Model '${modelToUse}' not found, falling back to '${fallbackModel}'`)
    return fallbackModel
  }

  return mappedModel
}

/**
 * Build provider options for AI model
 */
export const buildProviderOptions = () => ({
  anthropic: {
    thinking: { type: 'enabled', budgetTokens: 4096 },
  } satisfies AnthropicProviderOptions,
  openai: {
    ...(env.REASONING_ENABLED ? { reasoningEffort: 'medium' } : {}),
  },
})

/**
 * Get available models for the current configuration
 */
export const getAvailableModels = () => {
  return getDynamicModelMapping()
}

/**
 * Validate if a model is available in the current configuration
 */
export const isModelAvailable = (modelId: string): boolean => {
  const MODEL_MAPPING = getDynamicModelMapping()
  return Object.keys(MODEL_MAPPING).includes(modelId)
}

/**
 * Get model selection diagnostics for debugging
 */
export const getModelSelectionDiagnostics = () => {
  const MODEL_MAPPING = getDynamicModelMapping()
  const DEFAULT_MODELS = getDynamicDefaultModels()
  const primaryProvider = getPrimaryProvider()

  return {
    availableModels: Object.keys(MODEL_MAPPING),
    availableModelCount: Object.keys(MODEL_MAPPING).length,
    defaultModels: DEFAULT_MODELS,
    primaryProvider,
    modelMapping: MODEL_MAPPING,
    providers: {
      openrouter: isProviderAvailable('openrouter'),
      azure: isProviderAvailable('azure'),
      anthropic: isProviderAvailable('anthropic'),
      databricks: isProviderAvailable('databricks'),
      xai: isProviderAvailable('xai'),
    },
  }
}

/**
 * Get a fallback model when the primary model fails
 */
export const getFallbackModel = (
  failedModelId: string,
  userPlan: string,
  isFileEdit = false
): string | null => {
  const MODEL_MAPPING = getDynamicModelMapping()
  const DEFAULT_MODELS = getDynamicDefaultModels()
  
  // Get available models that are different from the failed one
  const availableModels = Object.keys(MODEL_MAPPING).filter(
    modelId => modelId !== failedModelId && canAccessModel(userPlan, modelId)
  )
  
  if (availableModels.length === 0) {
    return null
  }
  
  // Priority order for fallback models
  const fallbackPriority = [
    'chat-model-reasoning-openrouter',
    'chat-model-reasoning-azure',
    'chat-model-reasoning-azure-mini',
    'chat-model-reasoning-anthropic',
    'chat-model-databricks-claude',
    'chat-model-reasoning-xai'
  ]
  
  // Find the first available fallback model in priority order
  for (const priorityModel of fallbackPriority) {
    if (availableModels.includes(priorityModel)) {
      return priorityModel
    }
  }
  
  // If no priority model is available, return the first available one
  return availableModels[0] || null
}
