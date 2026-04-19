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
    const existing = await ctx.db
      .query("trafficWeekly")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const row of args.rows) {
      await ctx.db.insert("trafficWeekly", {
        campaignId: args.campaignId,
        ...row,
      });
    }
  },
});
