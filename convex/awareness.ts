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
        mediumDetail: v.optional(v.string()),
        agenda: v.optional(v.string()),
        device: v.optional(v.string()),
        spend: v.number(),
        impressions: v.number(),
        views: v.number(),
        clicks: v.number(),
        cpv: v.number(),
        ctr: v.number(),
        vtr: v.number(),
        conversions: v.optional(v.number()),
        conversionRevenue: v.optional(v.number()),
        signupCorporate: v.optional(v.number()),
        signupPersonal: v.optional(v.number()),
        leadsCollected: v.optional(v.number()),
        date: v.string(),
        recordedAt: v.number(),
        extraData: v.optional(v.string()),
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

export const clearDigitalKpis = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("digitalKpis")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
  },
});

export const clearViralContents = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("viralContents")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
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

    // URL 기준으로 기존 데이터 맵 생성 — 썸네일/좋아요/댓글 등 보존용
    const existingByUrl = new Map(existing.map(r => [r.url, r]));
    const incomingUrls = new Set(args.rows.map(r => r.url));

    // URL이 새 목록에 없는 기존 행만 삭제
    for (const row of existing) {
      if (!incomingUrls.has(row.url)) await ctx.db.delete(row._id);
    }

    for (const row of args.rows) {
      const prev = existingByUrl.get(row.url);
      if (prev) {
        // 기존 행 업데이트 — 새 값이 없으면 기존 값 유지 (썸네일/stats 보존)
        await ctx.db.patch(prev._id, {
          platform:     row.platform || prev.platform,
          creator:      row.creator  || prev.creator,
          title:        (row.title && row.title !== "-") ? row.title : prev.title,
          date:         row.date     || prev.date,
          views:        row.views    > 0 ? row.views    : prev.views,
          likes:        row.likes    > 0 ? row.likes    : prev.likes,
          comments:     row.comments > 0 ? row.comments : prev.comments,
          url:          row.url,
          thumbnailUrl: row.thumbnailUrl || prev.thumbnailUrl,
        });
      } else {
        await ctx.db.insert("viralContents", { campaignId: args.campaignId, ...row });
      }
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
      platform: v.optional(v.string()),
      views: v.optional(v.number()),
      likes: v.optional(v.number()),
      comments: v.optional(v.number()),
      thumbnailUrl: v.optional(v.string()),
      commentsList: v.optional(v.array(v.any())),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.viralId);
    if (!existing) return; // 동시성으로 삭제된 경우 조용히 스킵

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
      commentsList: v.optional(v.array(v.any())),
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

