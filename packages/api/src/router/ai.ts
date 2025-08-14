/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * ai.ts
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

import { createAzure } from '@ai-sdk/azure'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { anthropic } from '@ai-sdk/anthropic'
import { checkAndUpdateEnhanceUsage } from '@libra/auth/utils/subscription-limits'
import { log, tryCatch } from '@libra/common'
import { TRPCError } from '@trpc/server'
import { customProvider, generateText } from 'ai'
import { z } from 'zod/v4'
import { createTRPCRouter, organizationProcedure, protectedProcedure } from '../trpc'

// Environment variables access
const env = {
  AZURE_RESOURCE_NAME: process.env['AZURE_RESOURCE_NAME'],
  AZURE_API_KEY: process.env['AZURE_API_KEY'],
  AZURE_DEPLOYMENT_NAME: process.env['AZURE_DEPLOYMENT_NAME'],
  AZURE_BASE_URL: process.env['AZURE_BASE_URL'],
  CLOUDFLARE_ACCOUNT_ID: process.env['CLOUDFLARE_ACCOUNT_ID'],
  CLOUDFLARE_AIGATEWAY_NAME: process.env['CLOUDFLARE_AIGATEWAY_NAME'],
  OPENROUTER_API_KEY: process.env['OPENROUTER_API_KEY'],
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
  REASONING_ENABLED: process.env['REASONING_ENABLED'] === 'true',
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
 * Create AI providers based on configuration
 */
const createAIProviders = () => {
  const config = getAIProviderConfig()
  const providers: any = {}

  // Priority 1: OpenRouter (if configured)
  if (config.openrouter.isConfigured) {
    const openrouterConfig = {
      apiKey: config.openrouter.apiKey,
      headers: {
        'HTTP-Referer': 'https://libra.dev',
        'X-Title': 'Libra AI',
      },
    }
    providers.openrouter = createOpenRouter(openrouterConfig)
  }

  // Priority 2: Azure (if configured)
  if (config.azure.isConfigured) {
    providers.azure = createAzure({
      resourceName: config.azure.resourceName,
      apiKey: config.azure.apiKey,
      apiVersion: config.azure.apiVersion,
      ...(config.azure.baseURL && { baseURL: config.azure.baseURL }),
    })
  }

  // Priority 3: Anthropic (if configured)
  if (config.anthropic.isConfigured) {
    providers.anthropic = anthropic
  }

  return providers
}

/**
 * Create the main AI provider with dynamic model selection
 */
const createMainProvider = () => {
  const providers = createAIProviders()
  const languageModels: Record<string, any> = {}

  // Add OpenRouter models (highest priority)
  if (providers.openrouter) {
    languageModels['chat-model-reasoning-openrouter'] = providers.openrouter('anthropic/claude-3-5-sonnet')
    languageModels['chat-model-reasoning-google'] = providers.openrouter('google/gemini-2.5-pro-preview')
    languageModels['chat-model-reasoning-claude'] = providers.openrouter('anthropic/claude-3-5-sonnet')
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

  // If no providers are configured, throw an error
  if (Object.keys(languageModels).length === 0) {
    throw new Error(
      'No AI providers configured. Please set at least one of: OPENROUTER_API_KEY, AZURE_API_KEY, or ANTHROPIC_API_KEY'
    )
  }

  return customProvider({ languageModels })
}

/**
 * Get the best available model based on provider priority
 */
const getBestAvailableModel = (): string => {
  const config = getAIProviderConfig()
  
  // Priority 1: OpenRouter
  if (config.openrouter.isConfigured) {
    return 'chat-model-reasoning-openrouter'
  }
  
  // Priority 2: Azure
  if (config.azure.isConfigured) {
    return 'chat-model-reasoning-azure'
  }
  
  // Priority 3: Anthropic
  if (config.anthropic.isConfigured) {
    return 'chat-model-reasoning-anthropic'
  }
  
  throw new Error('No AI providers available')
}

// Create AI provider
const myProvider = createMainProvider()

export const aiRouter = createTRPCRouter({
  generateText: organizationProcedure
    .input(
      z.object({
        prompt: z.string().min(1, 'Prompt cannot be empty'),
        modelId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const orgId = ctx.orgId
      const context = { userId, organizationId: orgId, operation: 'generateText' }

      log.ai('info', 'Starting AI text generation', {
        ...context,
        promptLength: input.prompt.length,
        modelId: input.modelId || 'default',
        reasoningEnabled: env.REASONING_ENABLED,
      })

      const [result, error] = await tryCatch(async () => {
        // Check if AI provider is configured
        if (!myProvider) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'AI provider not configured. Please check environment variables.',
          })
        }

        // Check and deduct enhance quota before processing
        const canUseEnhance = await checkAndUpdateEnhanceUsage(orgId)
        if (!canUseEnhance) {
          log.ai('warn', 'AI generation quota exceeded', context)
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Enhance quota exceeded. Please upgrade your plan or wait for next billing cycle.',
          })
        }

        // Get the best available model
        const selectedModel = getBestAvailableModel()

        log.ai('info', 'Processing AI prompt', {
          ...context,
          model: selectedModel,
          promptPreview: input.prompt.substring(0, 100) + (input.prompt.length > 100 ? '...' : ''),
        })

        // Generate text using AI SDK
        const result = await generateText({
          model: myProvider.languageModel(selectedModel),
          prompt: `Generate an enhanced version of this prompt (reply with only the enhanced prompt - no conversation, explanations, lead-in, bullet points, placeholders, or surrounding quotes):
                   ${input.prompt}`,
          providerOptions: {
            openai: {
              ...(env.REASONING_ENABLED ? { reasoningEffort: 'medium' } : {}),
            },
          },
        })

        log.ai('info', 'AI text generation completed successfully', {
          ...context,
          model: selectedModel,
          inputTokens: result.usage?.inputTokens || 0,
          outputTokens: result.usage?.outputTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
          finishReason: result.finishReason,
          responseLength: result.text.length,
        })

        return {
          text: result.text,
          usage: result.usage,
          finishReason: result.finishReason,
        }
      })

      if (error) {
        // Enhanced error logging with context
        if (error instanceof TRPCError) {
          if (error.code === 'FORBIDDEN') {
            // Quota errors are warnings, not system errors
            log.ai('warn', 'AI generation blocked by quota', context, error)
          } else {
            log.ai('error', 'AI generation failed with TRPC error', context, error)
          }
          throw error
        }

        // Log AI service failures as errors
        log.ai(
          'error',
          'AI service failure during text generation',
          {
            ...context,
            model: 'dynamic-selection',
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          },
          error instanceof Error ? error : new Error(String(error))
        )

        // Wrap other errors
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate enhanced text',
          cause: error,
        })
      }

      return result
    }),
})
