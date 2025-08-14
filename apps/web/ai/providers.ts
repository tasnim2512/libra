/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * providers.ts
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
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

import { env } from '@/env.mjs'
import { anthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { xai } from '@ai-sdk/xai'
import { createOpenRouter, openrouter } from '@openrouter/ai-sdk-provider'
import { customProvider } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

/**
 * Define the configuration type, ensuring the baseURL type is correct.
 */
type AzureConfig = {
  resourceName: string
  apiKey: string
  apiVersion: string
  baseURL?: string // Set as optional property
}

/**
 * AI Provider configuration with priority order
 */
type AIProviderConfig = {
  openrouter: {
    apiKey: string
    isConfigured: boolean
  }
  azure: {
    resourceName: string
    apiKey: string
    apiVersion: string
    baseURL?: string
    isConfigured: boolean
  }
  anthropic: {
    apiKey: string
    isConfigured: boolean
  }
}

/**
 * Provider priority order for fallback mechanism
 */
const PROVIDER_PRIORITY = ['openrouter', 'azure', 'anthropic', 'databricks', 'xai'] as const

/**
 * Check and configure AI providers based on environment variables
 */
const getAIProviderConfig = (): AIProviderConfig => {
  const config: AIProviderConfig = {
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY || '',
      isConfigured: Boolean(env.OPENROUTER_API_KEY),
    },
    azure: {
      resourceName: env.AZURE_RESOURCE_NAME || '',
      apiKey: env.AZURE_API_KEY || '',
      apiVersion: 'preview',
      isConfigured: Boolean(env.AZURE_RESOURCE_NAME && env.AZURE_API_KEY),
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      isConfigured: Boolean(env.ANTHROPIC_API_KEY),
    },
  }

  // Configure Azure baseURL if available
  if (env.AZURE_BASE_URL && config.azure.isConfigured) {
    const baseUrl = env.AZURE_BASE_URL.endsWith('/') ? env.AZURE_BASE_URL : `${env.AZURE_BASE_URL}/`
    const accountId = env.CLOUDFLARE_ACCOUNT_ID
    const gatewayName = env.CLOUDFLARE_AIGATEWAY_NAME
    const resourceName = env.AZURE_RESOURCE_NAME

    // Construct the complete baseURL for AI SDK v5, ensuring correct path separators
    // AI SDK v5 expects baseURL without /v1 suffix, it will add /v1{path} automatically
    config.azure.baseURL = `${baseUrl}${accountId}/${gatewayName}/azure-openai/${resourceName}/openai`
  }

  return config
}

/**
 * Validate provider configuration and provide helpful error messages
 */
const validateProviderConfig = (config: AIProviderConfig): void => {
  const availableProviders = Object.entries(config)
    .filter(([_, provider]) => provider.isConfigured)
    .map(([name, _]) => name)

  if (availableProviders.length === 0) {
    const errorMessage = [
      'No AI providers configured. Please set at least one of the following environment variables:',
      '',
      'Priority 1 (Recommended):',
      '  OPENROUTER_API_KEY=your_openrouter_api_key',
      '',
      'Priority 2:',
      '  AZURE_API_KEY=your_azure_api_key',
      '  AZURE_RESOURCE_NAME=your_azure_resource_name',
      '',
      'Priority 3:',
      '  ANTHROPIC_API_KEY=your_anthropic_api_key',
      '',
      'Priority 4:',
      '  DATABRICKS_TOKEN=your_databricks_token',
      '  DATABRICKS_BASE_URL=your_databricks_base_url',
      '',
      'Priority 5:',
      '  XAI_API_KEY=your_xai_api_key',
      '',
      'For OpenRouter (recommended), visit: https://openrouter.ai/',
      'For Azure OpenAI, visit: https://azure.microsoft.com/en-us/products/ai-services/openai-service',
      'For Anthropic, visit: https://www.anthropic.com/',
    ].join('\n')

    throw new Error(errorMessage)
  }

  // Log available providers for debugging
  console.log(`[AI Providers] Available providers: ${availableProviders.join(', ')}`)
  console.log(`[AI Providers] Primary provider: ${availableProviders[0]}`)
}

/**
 * Create AI providers based on configuration
 */
const createAIProviders = () => {
  const config = getAIProviderConfig()
  const providers: any = {}

  // Priority 1: OpenRouter (if configured)
  if (config.openrouter.isConfigured) {
    try {
      const openrouterConfig = {
        apiKey: config.openrouter.apiKey,
        headers: {
          'HTTP-Referer': 'https://libra.dev',
          'X-Title': 'Libra AI',
        },
      }
      providers.openrouter = createOpenRouter(openrouterConfig)
      console.log('[AI Providers] OpenRouter provider created successfully')
    } catch (error) {
      console.error('[AI Providers] Failed to create OpenRouter provider:', error)
    }
  }

  // Priority 2: Azure (if configured)
  if (config.azure.isConfigured) {
    try {
      providers.azure = createAzure({
        resourceName: config.azure.resourceName,
        apiKey: config.azure.apiKey,
        apiVersion: config.azure.apiVersion,
        ...(config.azure.baseURL && { baseURL: config.azure.baseURL }),
      })
      console.log('[AI Providers] Azure provider created successfully')
    } catch (error) {
      console.error('[AI Providers] Failed to create Azure provider:', error)
    }
  }

  // Priority 3: Anthropic (if configured)
  if (config.anthropic.isConfigured) {
    try {
      providers.anthropic = anthropic
      console.log('[AI Providers] Anthropic provider created successfully')
    } catch (error) {
      console.error('[AI Providers] Failed to create Anthropic provider:', error)
    }
  }

  // Priority 4: Databricks Claude (if configured)
  if (env.DATABRICKS_BASE_URL && env.DATABRICKS_TOKEN) {
    try {
      providers.databricks = createOpenAI({
        baseURL: env.DATABRICKS_BASE_URL,
        apiKey: env.DATABRICKS_TOKEN,
      })
      console.log('[AI Providers] Databricks provider created successfully')
    } catch (error) {
      console.error('[AI Providers] Failed to create Databricks provider:', error)
    }
  }

  // Priority 5: XAI (if configured)
  if (env.XAI_API_KEY) {
    try {
      providers.xai = xai
      console.log('[AI Providers] XAI provider created successfully')
    } catch (error) {
      console.error('[AI Providers] Failed to create XAI provider:', error)
    }
  }

  return providers
}

/**
 * Create the main AI provider with dynamic model selection
 */
const createMainProvider = () => {
  const config = getAIProviderConfig()
  
  // Validate configuration before proceeding
  validateProviderConfig(config)
  
  const providers = createAIProviders()
  const languageModels: Record<string, any> = {}

  // Add OpenRouter models (highest priority)
  if (providers.openrouter) {
    languageModels['chat-model-reasoning-openrouter'] = providers.openrouter('anthropic/claude-3-5-sonnet')
    languageModels['chat-model-reasoning-google'] = providers.openrouter('google/gemini-2.5-pro-preview')
    languageModels['chat-model-reasoning-claude'] = providers.openrouter('anthropic/claude-3-5-sonnet')
    languageModels['chat-model-reasoning-gpt4o'] = providers.openrouter('openai/gpt-4o')
    languageModels['chat-model-reasoning-gpt4o-mini'] = providers.openrouter('openai/gpt-4o-mini')
  }

  // Add Azure models
  if (providers.azure) {
    languageModels['chat-model-reasoning-azure'] = providers.azure(env.AZURE_DEPLOYMENT_NAME || 'o4-mini')
    languageModels['chat-model-reasoning-azure-mini'] = providers.azure('gpt-4.1-mini')
    languageModels['chat-model-reasoning-azure-nano'] = providers.azure('gpt-4.1-nano')
  }

  // Add Anthropic models
  if (providers.anthropic) {
    languageModels['chat-model-reasoning-anthropic'] = providers.anthropic('claude-3-5-sonnet')
  }

  // Add Databricks models
  if (providers.databricks) {
    languageModels['chat-model-databricks-claude'] = providers.databricks('databricks-claude-3-5-sonnet')
  }

  // Add XAI models
  if (providers.xai) {
    languageModels['chat-model-reasoning-xai'] = providers.xai('grok-3-fast-beta')
  }

  // If no providers are configured, throw an error
  if (Object.keys(languageModels).length === 0) {
    throw new Error(
      'No AI providers configured. Please set at least one of: OPENROUTER_API_KEY, AZURE_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY'
    )
  }

  console.log(`[AI Providers] Created ${Object.keys(languageModels).length} language models`)
  return customProvider({ languageModels })
}

/**
 * Export the configured AI provider
 */
export const myProvider = createMainProvider()

/**
 * Export provider configuration for debugging and validation
 */
export const getProviderConfig = () => getAIProviderConfig()

/**
 * Check if a specific provider is available
 */
export const isProviderAvailable = (providerName: 'openrouter' | 'azure' | 'anthropic' | 'databricks' | 'xai'): boolean => {
  const config = getAIProviderConfig()
  switch (providerName) {
    case 'openrouter':
      return config.openrouter.isConfigured
    case 'azure':
      return config.azure.isConfigured
    case 'anthropic':
      return config.anthropic.isConfigured
    case 'databricks':
      return Boolean(env.DATABRICKS_BASE_URL && env.DATABRICKS_TOKEN)
    case 'xai':
      return Boolean(env.XAI_API_KEY)
    default:
      return false
  }
}

/**
 * Get the primary (highest priority) available provider
 */
export const getPrimaryProvider = (): string | null => {
  const config = getAIProviderConfig()
  
  for (const provider of PROVIDER_PRIORITY) {
    if (isProviderAvailable(provider)) {
      return provider
    }
  }
  
  return null
}

/**
 * Get provider status for debugging
 */
export const getProviderStatus = () => {
  const config = getAIProviderConfig()
  const status = {
    available: [] as string[],
    unavailable: [] as string[],
    primary: getPrimaryProvider(),
    totalModels: 0,
  }

  // Check each provider
  if (config.openrouter.isConfigured) status.available.push('openrouter')
  else status.unavailable.push('openrouter')
  
  if (config.azure.isConfigured) status.available.push('azure')
  else status.unavailable.push('azure')
  
  if (config.anthropic.isConfigured) status.available.push('anthropic')
  else status.unavailable.push('anthropic')
  
  if (env.DATABRICKS_BASE_URL && env.DATABRICKS_TOKEN) status.available.push('databricks')
  else status.unavailable.push('databricks')
  
  if (env.XAI_API_KEY) status.available.push('xai')
  else status.unavailable.push('xai')

  // Count total models - we can't directly access languageModels, so we'll estimate based on available providers
  try {
    let modelCount = 0
    if (config.openrouter.isConfigured) modelCount += 5 // OpenRouter models
    if (config.azure.isConfigured) modelCount += 3 // Azure models
    if (config.anthropic.isConfigured) modelCount += 1 // Anthropic models
    if (env.DATABRICKS_BASE_URL && env.DATABRICKS_TOKEN) modelCount += 1 // Databricks models
    if (env.XAI_API_KEY) modelCount += 1 // XAI models
    status.totalModels = modelCount
  } catch {
    status.totalModels = 0
  }

  return status
}
