import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCampaigns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("campaigns").order("desc").collect();
  },
});

export const getCampaignById = query({
  args: { id: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.id);
    return campaign;
  },
});

export const createCampaign = mutation({
  args: {
    name: v.string(),
    brandColor: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    createdBy: v.string(), // Changed to string for MVP
  },
  handler: async (ctx, args) => {
    // Generate simple slug
    const slug = args.name.toLowerCase().replace(/\s+/g, '-');
    const newId = await ctx.db.insert("campaigns", {
      name: args.name,
      slug,
      brandColor: args.brandColor,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "active",
      createdBy: args.createdBy,
    });
    return newId;
  },
});

// KPI 목표 + 탭 설정 업데이트
export const updateCampaignSettings = mutation({
  args: {
    id: v.id("campaigns"),
    kpiTargets: v.optional(v.array(v.object({
      label: v.string(),
      target: v.number(),
      current: v.number(),
      category: v.string(),
      description: v.optional(v.string()),
    }))),
    visibleTabs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.kpiTargets !== undefined) updates.kpiTargets = args.kpiTargets;
    if (args.visibleTabs !== undefined) updates.visibleTabs = args.visibleTabs;
    await ctx.db.patch(args.id, updates);
  },
});
