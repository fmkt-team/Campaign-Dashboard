import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── 매체 퍼포먼스 (digitalKpis) ───
export const getDigitalKpis = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("digitalKpis")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

export const syncDigitalKpis = mutation({
  args: {
    campaignId: v.id("campaigns"),
    rows: v.array(
      v.object({
        medium: v.string(),
        spend: v.number(),
        impressions: v.number(),
        views: v.number(),
        clicks: v.number(),
        cpv: v.number(),
        ctr: v.number(),
        vtr: v.number(),
        date: v.string(),
        recordedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("digitalKpis")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const row of args.rows) {
      await ctx.db.insert("digitalKpis", {
        campaignId: args.campaignId,
        ...row,
      });
    }
  },
});

// ─── 바이럴 컨텐츠 (viralContents) ───
export const getViralContents = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("viralContents")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

export const syncViralContents = mutation({
  args: {
    campaignId: v.id("campaigns"),
    rows: v.array(
      v.object({
        platform: v.string(),
        creator: v.string(),
        title: v.string(),
        date: v.string(),
        views: v.number(),
        likes: v.number(),
        comments: v.number(),
        url: v.string(),
        thumbnailUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("viralContents")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const row of args.rows) {
      await ctx.db.insert("viralContents", {
        campaignId: args.campaignId,
        ...row,
      });
    }
  },
});

export const updateViralRow = mutation({
  args: {
    viralId: v.id("viralContents"),
    updates: v.object({
      url: v.optional(v.string()),
      title: v.optional(v.string()),
      creator: v.optional(v.string()),
      date: v.optional(v.string()),
      views: v.optional(v.number()),
      likes: v.optional(v.number()),
      comments: v.optional(v.number()),
      thumbnailUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.viralId);
    if (!existing) throw new Error("Row not found");
    
    await ctx.db.patch(args.viralId, args.updates);
  },
});

export const deleteViralRow = mutation({
  args: { viralId: v.id("viralContents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.viralId);
  },
});

export const updateDigitalRow = mutation({
  args: {
    digitalId: v.id("digitalKpis"),
    updates: v.object({
      spend: v.optional(v.number()),
      views: v.optional(v.number()),
      impressions: v.optional(v.number()),
      clicks: v.optional(v.number()),
      cpv: v.optional(v.number()),
      ctr: v.optional(v.number()),
      vtr: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.digitalId);
    if (!existing) throw new Error("Row not found");
    
    await ctx.db.patch(args.digitalId, args.updates);
  },
});

export const deleteDigitalRow = mutation({
  args: { digitalId: v.id("digitalKpis") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.digitalId);
  },
});

// ─── 유튜브 광고 영상 (youtubeVideos) ───
export const getYouTubeVideos = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("youtubeVideos")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .order("asc")
      .collect();
  },
});

export const addYouTubeVideo = mutation({
  args: {
    campaignId: v.id("campaigns"),
    youtubeId: v.string(),
    title: v.string(),
    thumbnailUrl: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    likeRate: v.number(),
    uploadDate: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("youtubeVideos", args);
  },
});

export const updateYouTubeVideo = mutation({
  args: {
    videoId: v.id("youtubeVideos"),
    updates: v.object({
      title: v.optional(v.string()),
      views: v.optional(v.number()),
      likes: v.optional(v.number()),
      comments: v.optional(v.number()),
      likeRate: v.optional(v.number()),
      thumbnailUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.videoId, args.updates);
  },
});

export const deleteYouTubeVideo = mutation({
  args: { videoId: v.id("youtubeVideos") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.videoId);
  },
});
