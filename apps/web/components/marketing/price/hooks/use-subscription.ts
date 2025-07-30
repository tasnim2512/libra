/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * use-subscription.ts
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

import { authClient } from '@libra/auth/auth-client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTRPC } from '@/trpc/client'
import { useMutation } from '@tanstack/react-query'

export function useSubscription() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const trpc = useTRPC()
  
  const isAuthenticated = !!session

  // Create Portal Session mutation
  const createPortalSessionMutation = useMutation(
    trpc.stripe.createPortalSession.mutationOptions({
      onSuccess: async (data) => {
        const url = data?.data?.url || ''
        if (url) {
          router.push(url)
        } else {
          toast.error('Failed to get portal URL')
        }
      },
      onError: (err) => {
        toast.error('Failed to access billing portal, Please try again.')
      },
    })
  )

  const handleManageSubscription = async () => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    
    try {
      await createPortalSessionMutation.mutateAsync({})
    } catch (error) {
    }
  }

  const handleUpgradeSubscription = async (planName: string, seats: number, isYearly: boolean) => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    
    try {
      if (planName.toLowerCase().includes('free')) {
        router.push('/dashboard')
        return
      }
      
      const referenceId = activeOrganization?.id
      if (!referenceId) {
        toast.error('Failed to get organization info')
        return
      }
      
      const response = await authClient.subscription.upgrade({
        plan: planName,
        successUrl: "/dashboard",
        cancelUrl: "/#price",
        annual: isYearly,
        referenceId: referenceId,
        seats: 1
      })
      
      if (response) {
        if ('url' in response && typeof response.url === 'string' && response.url) {
          window.location.href = response.url
        } else if ('id' in response) {
          toast.success('Subscription created successfully')
          router.push('/dashboard')
        } else {
          toast.success('Subscription request processed')
          router.push('/dashboard')
        }
      } else {
        toast.error('Failed to create subscription, please try again later')
      }
    } catch (error) {
      toast.error('Subscription upgrade failed, please try again later')
    }
  }

  return {
    isAuthenticated,
    handleUpgradeSubscription,
    handleManageSubscription,
    isCreatingPortalSession: createPortalSessionMutation.isPending
  }
}