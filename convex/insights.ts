import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── 주간 인사이트 목록 조회 ─────────────────────────────────────
export const getInsights = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("campaignInsights")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

// ─── 인사이트 추가 ───────────────────────────────────────────────
export const addInsight = mutation({
  args: {
    campaignId: v.id("campaigns"),
    weekLabel: v.string(),
    headline: v.string(),
    body: v.string(),
    kpiLabel: v.optional(v.string()),
    kpiValue: v.optional(v.string()),
    kpiColor: v.optional(v.string()),
    growthLabel: v.optional(v.string()),
    growthValue: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("campaignInsights", {
      campaignId: args.campaignId,
      weekLabel: args.weekLabel,
      headline: args.headline,
      body: args.body,
      kpiLabel: args.kpiLabel,
      kpiValue: args.kpiValue,
      kpiColor: args.kpiColor,
      growthLabel: args.growthLabel,
      growthValue: args.growthValue,
      sortOrder: args.sortOrder,
    });
  },
});

// ─── 인사이트 수정 ───────────────────────────────────────────────
export const updateInsight = mutation({
  args: {
    id: v.id("campaignInsights"),
    weekLabel: v.string(),
    headline: v.string(),
    body: v.string(),
    kpiLabel: v.optional(v.string()),
    kpiValue: v.optional(v.string()),
    kpiColor: v.optional(v.string()),
    growthLabel: v.optional(v.string()),
    growthValue: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

// ─── 인사이트 삭제 ───────────────────────────────────────────────
export const deleteInsight = mutation({
  args: { id: v.id("campaignInsights") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
