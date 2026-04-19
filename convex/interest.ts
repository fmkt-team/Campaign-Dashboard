import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── 흥미 활동 성과 (interestActivities) ───
export const getInterestActivities = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("interestActivities")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

export const syncInterestActivities = mutation({
  args: {
    campaignId: v.id("campaigns"),
    rows: v.array(
      v.object({
        activityType: v.string(), 
        title: v.string(),        
        locationOrTarget: v.string(), 
        startDate: v.string(),
        endDate: v.string(),
        visitors: v.number(),     
        participants: v.number(), 
        budget: v.number(),       
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("interestActivities")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const row of args.rows) {
      await ctx.db.insert("interestActivities", {
        campaignId: args.campaignId,
        ...row,
      });
    }
  },
});
