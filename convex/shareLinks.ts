import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createShareLink = mutation({
  args: {
    campaignId: v.id("campaigns"),
    expiresInDays: v.number(),
    createdBy: v.string(), // passed by caller
  },
  handler: async (ctx, args) => {
    // Generate a simple random token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000;

    await ctx.db.insert("shareLinks", {
      campaignId: args.campaignId,
      token,
      expiresAt,
      createdBy: args.createdBy,
    });

    return token;
  },
});

export const validateToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const shareLink = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!shareLink) {
      return { status: "not_found" };
    }

    if (Date.now() > shareLink.expiresAt) {
      return { status: "expired" };
    }

    const campaign = await ctx.db.get(shareLink.campaignId);
    if (!campaign) {
      return { status: "not_found" };
    }

    return { status: "valid", campaign };
  },
});
