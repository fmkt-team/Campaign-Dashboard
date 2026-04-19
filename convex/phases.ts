import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 단계 아이템 타입
const phaseItemValidator = v.object({
  name: v.string(),
  description: v.string(),
  isHighlighted: v.optional(v.boolean()), // 강조 표시 여부
});

export const getPhases = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("campaignPhases")
      .withIndex("by_campaign", q => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

export const upsertPhase = mutation({
  args: {
    id: v.optional(v.id("campaignPhases")),
    campaignId: v.id("campaigns"),
    title: v.string(),
    subtitle: v.string(),
    sortOrder: v.number(),
    color: v.string(),
    items: v.array(phaseItemValidator),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    if (id) {
      await ctx.db.patch(id, data);
      return id;
    }
    return await ctx.db.insert("campaignPhases", data);
  },
});

export const deletePhase = mutation({
  args: { id: v.id("campaignPhases") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
