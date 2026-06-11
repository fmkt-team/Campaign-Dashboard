import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getVocEntries = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("popupVocEntries")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

export const addVocEntry = mutation({
  args: {
    campaignId: v.id("campaigns"),
    date: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("popupVocEntries", {
      campaignId: args.campaignId,
      date: args.date,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});

export const updateVocEntry = mutation({
  args: {
    id: v.id("popupVocEntries"),
    date: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      date: args.date,
      content: args.content,
      updatedAt: Date.now(),
    });
  },
});

export const deleteVocEntry = mutation({
  args: { id: v.id("popupVocEntries") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
