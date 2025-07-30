/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * page.tsx
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

import { initAuth } from "packages/auth/auth-server"
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { api } from "@/trpc/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@libra/ui/components/card'
import { Button } from '@libra/ui/components/button'
import { Sparkles, FolderOpen, TrendingUp, CreditCard } from 'lucide-react'
import Link from 'next/link'
import * as m from '@/paraglide/messages'
import {
  UsageCard,
  UsageCardCompact,
  PlanOverviewCard,
  UpgradeRecommendation,
  getUsageStatus
} from '@/components/billing'







export default async function BillingPage() {
    const auth = await initAuth()
    const headersList = await headers()
    const sessionData = await auth.api.getSession({
      headers: headersList,
    })
    const user = sessionData?.user
  
    if (!user) {
      redirect('/')
    }
    
    try {
      const subscription = await api.subscription.getUsage({})
      
      // Calculate usage percentage and status for each resource
      const getUsageStatus = (used: number, total: number) => {
        const percentage = total > 0 ? Math.min(Math.round((used / total) * 100), 100) : 0
        if (percentage >= 90) return 'danger'
        if (percentage >= 70) return 'warning'
        return 'normal'
      }

      // Calculate usage statuses for different resources
      const aiUsed = subscription.aiNumsLimit - subscription.aiNums
      const aiStatus = getUsageStatus(aiUsed, subscription.aiNumsLimit)

      const seatsStatus = getUsageStatus(subscription.seats, subscription.seatsLimit)

      const projectsUsed = subscription.projectNumsLimit - subscription.projectNums
      const projectsStatus = getUsageStatus(projectsUsed, subscription.projectNumsLimit)

      return (
        <div className="flex flex-col gap-6 lg:gap-8 px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
          {/* Plan Overview - Simplified */}
          <PlanOverviewCard
            planName={subscription.plan}
            periodEnd={subscription.periodEnd ? new Date(subscription.periodEnd) : undefined}
            showUpgrade={subscription.plan !== 'MAX'}
          />

          {/* Usage Details - Middle Layer */}
          <div className="flex flex-col gap-5 lg:gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-lg bg-muted/50 shadow-sm">
                <TrendingUp className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground" />
              </div>
              <h2 className="text-xl lg:text-2xl font-semibold tracking-tight text-foreground">
                {m['dashboard.billing.usage.title']()}
              </h2>
            </div>

            {/* Urgent upgrade banner */}
            <UpgradeRecommendation
              planName={subscription.plan}
              hasUrgentIssues={subscription.plan !== 'MAX' && (aiStatus === 'danger' || seatsStatus === 'danger' || projectsStatus === 'danger')}
            />

            {/* Usage Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
              {/* AI Messages Usage - Simplified */}
              <UsageCard
                icon={Sparkles}
                title={m['dashboard.billing.usage.aiMessages.title']()}
                used={subscription.aiNumsLimit - subscription.aiNums}
                total={subscription.aiNumsLimit}
                description={
                  subscription.planDetails?.paid && subscription.planDetails?.free
                    ? `AI消息配额 (付费 ${subscription.planDetails.paid.aiNums} + 免费 ${subscription.planDetails.free.aiNums})`
                    : m['dashboard.billing.usage.aiMessages.description']()
                }
                status={aiStatus}
                actionButton={
                  subscription.aiNums <= 0 && subscription.plan !== 'MAX' ? (
                    <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                      <Link href="/#price">{m['dashboard.billing.usage.aiMessages.upgradeForMore']()}</Link>
                    </Button>
                  ) : undefined
                }
              />


              {/* Project Usage - Simplified */}
              <UsageCard
                icon={FolderOpen}
                title={m['dashboard.billing.usage.projects.title']()}
                used={subscription.projectNumsLimit - subscription.projectNums}
                total={subscription.projectNumsLimit}
                description={
                  subscription.planDetails?.paid && subscription.planDetails?.free
                    ? `项目配额 (付费 ${subscription.planDetails.paid.projectNums} + 免费 ${subscription.planDetails.free.projectNums})`
                    : m['dashboard.billing.usage.projects.description']()
                }
                status={projectsStatus}
                actionButton={
                  subscription.projectNums <= 0 && subscription.plan !== 'MAX' ? (
                    <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                      <Link href="/#price">{m['dashboard.billing.usage.projects.createMore']()}</Link>
                    </Button>
                  ) : undefined
                }
              />
            </div>

          </div>

          {/* Upgrade Recommendation - Bottom Layer */}
          <UpgradeRecommendation
            planName={subscription.plan}
            hasUrgentIssues={false}
          />
        </div>
      )
    } catch {
      return (
        <div className="flex flex-col gap-4 lg:gap-6 px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
          <div className="flex items-center gap-2 lg:gap-3">
            <CreditCard className="h-5 w-5 lg:h-6 lg:w-6 text-primary" />
            <div>
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight">{m['dashboard.billing.title']()}</h1>
              <p className="text-sm lg:text-base text-muted-foreground">{m['dashboard.billing.subtitle']()}</p>
            </div>
          </div>
          
          <Card className="glass-1 border-red-200 shadow-lg">
            <CardHeader className="p-4 lg:p-6">
              <CardTitle className="text-red-600 text-base lg:text-lg">{m['dashboard.billing.loadError.title']()}</CardTitle>
              <CardDescription className="text-xs lg:text-sm mt-1">
                {m['dashboard.billing.loadError.description']()}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 lg:p-6 pt-0">
              <Button variant="outline" asChild>
                <Link href="/dashboard">{m['dashboard.billing.loadError.backToDashboard']()}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }
}