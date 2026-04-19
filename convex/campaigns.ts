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
