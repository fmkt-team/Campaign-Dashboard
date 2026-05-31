import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── 유입 상세 성과 (trafficWeekly) ───
export const getTrafficWeekly = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trafficWeekly")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

// weekStart 기준 upsert — 기존 레코드는 업데이트, 없으면 삽입
// 다른 기간 데이터는 건드리지 않아 안전함
export const syncTrafficWeekly = mutation({
  args: {
    campaignId: v.id("campaigns"),
    rows: v.array(
      v.object({
        weekLabel: v.string(),
        weekStart: v.string(),
        sessions: v.number(),
        users: v.number(),
        avgEngagementSec: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("trafficWeekly")
        .withIndex("by_campaign_week", (q) =>
          q.eq("campaignId", args.campaignId).eq("weekStart", row.weekStart)
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          weekLabel: row.weekLabel,
          sessions: row.sessions,
          users: row.users,
          avgEngagementSec: row.avgEngagementSec,
        });
      } else {
        await ctx.db.insert("trafficWeekly", {
          campaignId: args.campaignId,
          ...row,
        });
      }
    }
  },
});
