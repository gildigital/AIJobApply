/**
 * API Usage Analytics Utilities
 * 
 * These functions help query and analyze API usage data for billing and monitoring.
 */

import { db } from "../db.js";
import { sql } from "drizzle-orm";

export interface UserUsageStats {
  userId: number;
  totalCalls: number;
  totalCostCents: number;
  totalTokens: number;
  averageResponseTime: number;
  successRate: number;
  byProvider: {
    openai: { calls: number; costCents: number; tokens: number };
    anthropic: { calls: number; costCents: number; tokens: number };
  };
  byDate: { date: string; calls: number; costCents: number }[];
}

/**
 * Get API usage statistics for a specific user
 */
export async function getUserUsageStats(
  userId: number, 
  startDate?: Date, 
  endDate?: Date
): Promise<UserUsageStats> {
  const whereClause = startDate && endDate 
    ? sql`WHERE user_id = ${userId} AND timestamp >= ${startDate} AND timestamp <= ${endDate}`
    : sql`WHERE user_id = ${userId}`;

  // Get overall stats
  const [overallStats] = await db.execute(sql`
    SELECT 
      COUNT(*) as total_calls,
      COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(AVG(response_time_ms), 0) as avg_response_time,
      (COUNT(CASE WHEN success = true THEN 1 END) * 100.0 / COUNT(*)) as success_rate
    FROM api_usage
    ${whereClause}
  `);

  // Get stats by provider
  const providerStats = await db.execute(sql`
    SELECT 
      api_provider,
      COUNT(*) as calls,
      COALESCE(SUM(estimated_cost_cents), 0) as cost_cents,
      COALESCE(SUM(total_tokens), 0) as tokens
    FROM api_usage
    ${whereClause}
    GROUP BY api_provider
  `);

  // Get stats by date
  const dailyStats = await db.execute(sql`
    SELECT 
      DATE(timestamp) as date,
      COUNT(*) as calls,
      COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
    FROM api_usage
    ${whereClause}
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
    LIMIT 30
  `);

  // Format provider stats
  const byProvider = {
    openai: { calls: 0, costCents: 0, tokens: 0 },
    anthropic: { calls: 0, costCents: 0, tokens: 0 }
  };

  providerStats.forEach((row: any) => {
    if (row.api_provider === 'openai' || row.api_provider === 'anthropic') {
      byProvider[row.api_provider] = {
        calls: parseInt(row.calls),
        costCents: parseInt(row.cost_cents),
        tokens: parseInt(row.tokens)
      };
    }
  });

  return {
    userId,
    totalCalls: parseInt(overallStats.total_calls),
    totalCostCents: parseInt(overallStats.total_cost_cents),
    totalTokens: parseInt(overallStats.total_tokens),
    averageResponseTime: parseFloat(overallStats.avg_response_time),
    successRate: parseFloat(overallStats.success_rate),
    byProvider,
    byDate: dailyStats.map((row: any) => ({
      date: row.date,
      calls: parseInt(row.calls),
      costCents: parseInt(row.cost_cents)
    }))
  };
}

/**
 * Get top users by API usage (for admin monitoring)
 */
export async function getTopUsersByUsage(
  startDate?: Date, 
  endDate?: Date, 
  limit: number = 10
): Promise<Array<{
  userId: number;
  username?: string;
  totalCalls: number;
  totalCostCents: number;
  totalTokens: number;
}>> {
  const whereClause = startDate && endDate 
    ? sql`WHERE au.timestamp >= ${startDate} AND au.timestamp <= ${endDate}`
    : sql`WHERE 1=1`;

  const results = await db.execute(sql`
    SELECT 
      au.user_id,
      u.username,
      COUNT(*) as total_calls,
      COALESCE(SUM(au.estimated_cost_cents), 0) as total_cost_cents,
      COALESCE(SUM(au.total_tokens), 0) as total_tokens
    FROM api_usage au
    LEFT JOIN users u ON au.user_id = u.id
    ${whereClause}
    GROUP BY au.user_id, u.username
    ORDER BY total_cost_cents DESC
    LIMIT ${limit}
  `);

  return results.map((row: any) => ({
    userId: parseInt(row.user_id),
    username: row.username,
    totalCalls: parseInt(row.total_calls),
    totalCostCents: parseInt(row.total_cost_cents),
    totalTokens: parseInt(row.total_tokens)
  }));
}

/**
 * Get API usage trends over time
 */
export async function getUsageTrends(days: number = 30): Promise<Array<{
  date: string;
  totalCalls: number;
  totalCostCents: number;
  openaiCalls: number;
  anthropicCalls: number;
  avgResponseTime: number;
  successRate: number;
}>> {
  const results = await db.execute(sql`
    SELECT 
      DATE(timestamp) as date,
      COUNT(*) as total_calls,
      COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
      COUNT(CASE WHEN api_provider = 'openai' THEN 1 END) as openai_calls,
      COUNT(CASE WHEN api_provider = 'anthropic' THEN 1 END) as anthropic_calls,
      COALESCE(AVG(response_time_ms), 0) as avg_response_time,
      (COUNT(CASE WHEN success = true THEN 1 END) * 100.0 / COUNT(*)) as success_rate
    FROM api_usage
    WHERE timestamp >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `);

  return results.map((row: any) => ({
    date: row.date,
    totalCalls: parseInt(row.total_calls),
    totalCostCents: parseInt(row.total_cost_cents),
    openaiCalls: parseInt(row.openai_calls),
    anthropicCalls: parseInt(row.anthropic_calls),
    avgResponseTime: parseFloat(row.avg_response_time),
    successRate: parseFloat(row.success_rate)
  }));
}

/**
 * Check if a user has exceeded their usage limits
 */
export async function checkUserUsageLimits(
  userId: number,
  dailyLimitCents?: number,
  monthlyLimitCents?: number
): Promise<{
  dailyUsage: number;
  monthlyUsage: number;
  dailyExceeded: boolean;
  monthlyExceeded: boolean;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Get daily usage
  const [dailyResult] = await db.execute(sql`
    SELECT COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
    FROM api_usage
    WHERE user_id = ${userId} AND timestamp >= ${today}
  `);

  // Get monthly usage  
  const [monthlyResult] = await db.execute(sql`
    SELECT COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
    FROM api_usage
    WHERE user_id = ${userId} AND timestamp >= ${firstDayOfMonth}
  `);

  const dailyUsage = parseInt(dailyResult.cost_cents);
  const monthlyUsage = parseInt(monthlyResult.cost_cents);

  return {
    dailyUsage,
    monthlyUsage,
    dailyExceeded: dailyLimitCents ? dailyUsage > dailyLimitCents : false,
    monthlyExceeded: monthlyLimitCents ? monthlyUsage > monthlyLimitCents : false
  };
} 