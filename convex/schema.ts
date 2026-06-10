import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()), // Added optional to prevent legacy data clash
    passwordHash: v.optional(v.string()),
    role: v.optional(v.string()), // Changed from literal to string
    createdAt: v.optional(v.number()),
    // Legacy fields from old project existing in DB:
    brand: v.optional(v.string()),
    displayName: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    username: v.optional(v.string()),
  }).index("by_email", ["email"]),

  campaigns: defineTable({
    name: v.string(),
    slug: v.string(),
    brandColor: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(v.literal("active"), v.literal("completed")),
    createdBy: v.string(),
    // KPI 목표 설정 (캠페인별)
    kpiTargets: v.optional(v.array(v.object({
      label: v.string(),        // 예: "캠페인 노출"
      target: v.number(),       // 목표 수치
      current: v.number(),      // 수동 입력 현재값 (자동합산 외 보정용)
      category: v.string(),     // "exposure" | "event" | "popup" 등
      description: v.optional(v.string()), // 부가 설명
    }))),
    // 표시할 탭 목록 (없으면 전체 표시)
    visibleTabs: v.optional(v.array(v.string())),
    // GA4 Property ID (유입 성과 페이지에서 설정)
    officialGa4Id: v.optional(v.string()),
    microGa4Id: v.optional(v.string()),
    // 네이버 플레이스 URL (흥미 상세 리뷰 분석)
    naverPlaceUrl: v.optional(v.string()),
    // 네이버 키워드 그룹 (유입 상세 브랜드 검색, JSON 문자열)
    naverKeywordGroups: v.optional(v.string()),
    // 매체 퍼포먼스 구글 시트 URL (자동 재동기화용)
    digitalSheetUrl: v.optional(v.string()),
    // 주간 요약 메모 (JSON 문자열: { "WEEK 1": "메모내용", ... })
    weeklyMemos: v.optional(v.string()),
    // 팝업 기본 날짜 필터
    popupDefaultDateFrom: v.optional(v.string()),
    popupDefaultDateTo:   v.optional(v.string()),
  }),

  milestones: defineTable({
    campaignId: v.id("campaigns"),
    title: v.string(),
    date: v.string(),
    color: v.string(),
    isCompleted: v.boolean(),
  }).index("by_campaign", ["campaignId"]),

  timelineActivities: defineTable({
    campaignId: v.id("campaigns"),
    label: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    color: v.string(),
  }).index("by_campaign", ["campaignId"]),

  digitalKpis: defineTable({
    campaignId: v.id("campaigns"),
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
    // 시트에서 감지된 추가 컬럼 데이터 (JSON 문자열로 저장, key: 컬럼명, value: 숫자)
    extraData: v.optional(v.string()),
  }).index("by_campaign", ["campaignId"]),

  youtubeVideos: defineTable({
    campaignId: v.id("campaigns"),
    youtubeId: v.string(),
    title: v.string(),
    thumbnailUrl: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    likeRate: v.number(),
    uploadDate: v.string(),
    commentsList: v.optional(v.array(v.any())),
  }).index("by_campaign", ["campaignId"]),

  trafficWeekly: defineTable({
    campaignId: v.id("campaigns"),
    weekLabel: v.string(),
    weekStart: v.string(),
    sessions: v.number(),
    users: v.number(),
    avgEngagementSec: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_week", ["campaignId", "weekStart"]),

  salesWeekly: defineTable({
    campaignId: v.id("campaigns"),
    productName: v.string(),
    weekLabel: v.string(),
    revenue2025: v.number(),
    revenue2026: v.number(),
  }).index("by_campaign", ["campaignId"]),

  ganttTasks: defineTable({
    campaignId: v.id("campaigns"),
    category: v.string(),           // 대분류 (A열)
    subTask: v.string(),            // 업무명 (C열)
    assignee: v.string(),           // 담당자 (E열)
    startDate: v.string(),          // 시작일 YYYY-MM-DD (기본 활동)
    endDate: v.string(),            // 종료일 YYYY-MM-DD (기본 활동)
    progress: v.number(),           // 진척도 0~100
    sortOrder: v.number(),          // 표시 순서
    color: v.string(),              // 막대 색상
    isManuallyEdited: v.boolean(),  // 수기 수정 여부
    note: v.optional(v.string()),   // 추가 메모/텍스트
    barLabel: v.optional(v.string()), // 바에 표시할 텍스트
    // 추가 활동들 (다중 활동 지원)
    activities: v.optional(v.array(v.object({
      id: v.string(),               // 고유 ID
      name: v.string(),             // 활동명
      startDate: v.string(),        // 시작일
      endDate: v.string(),          // 종료일
      progress: v.number(),         // 진척도
      color: v.optional(v.string()), // 활동 색상 (선택)
    }))),
    // 그래프/차트 데이터 (여러 개 추가 가능)
    graphs: v.optional(v.array(v.object({
      id: v.string(),               // 고유 ID
      title: v.string(),            // 그래프 제목
      type: v.string(),             // 'line' | 'bar' | 'area' | 'pie'
      description: v.optional(v.string()), // 그래프 설명
      imageUrl: v.optional(v.string()), // 이미지 URL (첨부된 이미지)
      data: v.optional(v.string()), // JSON 문자열로 저장된 차트 데이터
      createdAt: v.number(),
    })))
  }).index("by_campaign", ["campaignId"]),

  campaignPhases: defineTable({
    campaignId: v.id("campaigns"),
    title: v.string(),       // "Phase 1"
    subtitle: v.string(),    // "캠페인 홍미 유도 및 확산"
    sortOrder: v.number(),
    color: v.string(),       // 페이즈 대표 색상
    items: v.array(v.object({
      name: v.string(),
      description: v.string(),
      isHighlighted: v.optional(v.boolean()),
    })),
  }).index("by_campaign", ["campaignId"]),


  viralContents: defineTable({
    campaignId: v.id("campaigns"),
    platform: v.string(),
    creator: v.string(),
    title: v.string(),
    date: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    url: v.string(),
    thumbnailUrl: v.optional(v.string()),
    commentsList: v.optional(v.array(v.any())),
  }).index("by_campaign", ["campaignId"]),

  interestActivities: defineTable({
    campaignId: v.id("campaigns"),
    activityType: v.string(),
    title: v.string(),
    locationOrTarget: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    visitors: v.number(),
    participants: v.number(),
    budget: v.number(),
    vipCount: v.optional(v.number()),
    // 팝업 상세 예약/방문 데이터용 필드 (Optional)
    generalReserveCount: v.optional(v.number()),
    generalReservePeople: v.optional(v.number()),
    vipReserveCount: v.optional(v.number()),
    vipReservePeople: v.optional(v.number()),
    actualVisitCount: v.optional(v.number()),
    vipActualVisitCount: v.optional(v.number()),
    actualVisitCountTeam: v.optional(v.number()),
  }).index("by_campaign", ["campaignId"]),

  campaignInsights: defineTable({
    campaignId: v.id("campaigns"),
    weekLabel: v.string(),       // 예: "WEEK 1"
    headline: v.string(),        // 핵심 헤드라인
    body: v.string(),            // 상세 내용
    kpiLabel: v.optional(v.string()),   // 핵심 KPI 라벨
    kpiValue: v.optional(v.string()),   // 핵심 KPI 값 (문자열)
    kpiColor: v.optional(v.string()),   // Tailwind 색상 클래스
    growthLabel: v.optional(v.string()), // 성장률 라벨
    growthValue: v.optional(v.string()), // 성장률 값 (예: "+12.5%")
    sortOrder: v.number(),
  }).index("by_campaign", ["campaignId"]),

  shareLinks: defineTable({
    campaignId: v.id("campaigns"),
    token: v.string(),
    expiresAt: v.number(),
    createdBy: v.string(),
  }).index("by_token", ["token"]),

  // ── 소셜 키워드 분석 ────────────────────────────────────────────
  socialKeywords: defineTable({
    campaignId: v.id("campaigns"),
    keyword: v.string(),
    platforms: v.array(v.string()), // ["X", "Instagram"]
    createdAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  socialPosts: defineTable({
    campaignId: v.id("campaigns"),
    keyword: v.string(),
    platform: v.string(),       // "X" | "Instagram"
    postUrl: v.string(),
    text: v.string(),
    author: v.string(),
    authorHandle: v.optional(v.string()),
    date: v.string(),           // YYYY-MM-DD
    likes: v.number(),
    replies: v.number(),
    reposts: v.optional(v.number()),
    views: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_campaign", ["campaignId"])
    .index("by_campaign_keyword", ["campaignId", "keyword"]),
});
