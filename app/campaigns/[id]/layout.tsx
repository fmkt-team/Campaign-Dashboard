"use client";

import { usePathname } from "next/navigation";
import { useState, use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { motion } from "framer-motion";
import { Share2, Settings2, X, LayoutDashboard, Eye, Megaphone, Heart, ArrowDownToLine, ShoppingCart, BarChart3, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ALL_TABS = [
  { name: "타임라인", path: "/timeline", icon: LayoutDashboard },
  { name: "인지 상세", path: "/awareness", icon: Eye },
  { name: "흥미 상세", path: "/interest", icon: Heart },
  { name: "유입 상세", path: "/conversion", icon: ArrowDownToLine },
  { name: "매출 상세", path: "/sales", icon: ShoppingCart },
  { name: "주간 인사이트", path: "/insights", icon: BarChart3 },
];

export default function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const pathname = usePathname();
  const resolvedParams = use(params);
  const campaign = useQuery(api.campaigns.getCampaignById, { id: resolvedParams.id as Id<"campaigns"> });
  const updateSettings = useMutation(api.campaigns.updateCampaignSettings);
  const generateLinkMutation = useMutation(api.shareLinks.createShareLink);
  const [shareMsg, setShareMsg] = useState("");
  const [showTabManager, setShowTabManager] = useState(false);

  const handleShare = async () => {
    if (!campaign) return;
    try {
      const token = await generateLinkMutation({
        campaignId: campaign._id,
        expiresInDays: 7,
        createdBy: "admin",
      });
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setShareMsg("✅ 링크 복사 완료!");
      setTimeout(() => setShareMsg(""), 3000);
    } catch (e: any) {
      alert("공유 링크 생성 실패: " + e.message);
    }
  };

  // 표시할 탭 결정 (visibleTabs가 없으면 전체 표시)
  const visibleTabs = campaign?.visibleTabs ?? ALL_TABS.map(t => t.path);
  const filteredTabs = ALL_TABS.filter(t => visibleTabs.includes(t.path));

  const handleToggleTab = async (path: string) => {
    if (!campaign) return;
    const current = campaign.visibleTabs ?? ALL_TABS.map(t => t.path);
    const updated = current.includes(path)
      ? current.filter(p => p !== path)
      : [...current, path];
    // 최소 1개 탭은 유지
    if (updated.length === 0) return;
    await updateSettings({ id: campaign._id, visibleTabs: updated });
  };

  if (campaign === undefined) {
    return <div className="p-12 text-gray-400">Loading campaign...</div>;
  }

  if (campaign === null) {
    return <div className="p-12 text-gray-900">Campaign not found.</div>;
  }

  return (
    <div className="min-h-screen flex bg-[#F8F9FA]">
      {/* ── 좌측 사이드바 ── */}
      <aside className="w-[240px] shrink-0 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen z-40">
        {/* 상단 로고 / 캠페인 이름 */}
        <div className="px-5 pt-6 pb-4 border-b border-gray-50">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-600 text-xs mb-4 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
            캠페인 목록
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-md shadow-sm shrink-0" style={{ backgroundColor: campaign.brandColor }} />
            <h1 className="text-sm font-bold text-gray-900 leading-tight truncate">{campaign.name}</h1>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-mono">
            {campaign.startDate} ~ {campaign.endDate || "Ongoing"}
          </p>
        </div>

        {/* 탭 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredTabs.map((tab) => {
            const isActive = pathname.includes(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                href={`/campaigns/${campaign._id}${tab.path}`}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.name}
                {isActive && (
                  <motion.div
                    layoutId="active-sidebar-tab"
                    className="absolute inset-0 bg-gray-900 rounded-xl -z-10"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* 하단 액션 버튼들 */}
        <div className="px-3 pb-4 space-y-2 border-t border-gray-50 pt-3">
          <Button
            onClick={() => setShowTabManager(!showTabManager)}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-400 hover:text-gray-700 hover:bg-gray-50 gap-2 text-xs h-9"
          >
            <Settings2 className="w-3.5 h-3.5" />
            탭 관리
          </Button>
          <Button
            onClick={handleShare}
            variant="ghost"
            size="sm"
            className={`w-full justify-start gap-2 text-xs h-9 transition-all ${
              shareMsg ? "text-green-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            {shareMsg || "뷰어 링크 복사"}
          </Button>
        </div>
      </aside>

      {/* ── 탭 관리 패널 (오버레이) ── */}
      {showTabManager && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowTabManager(false)} />
          <div className="relative ml-[240px] w-[320px] bg-white border-r border-gray-100 shadow-xl h-full flex flex-col animate-in slide-in-from-left-2 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">탭 관리</h3>
              <button onClick={() => setShowTabManager(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 px-5 py-4 space-y-2 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-4">캠페인 목적에 맞는 탭만 표시할 수 있습니다.</p>
              {ALL_TABS.map((tab) => {
                const isVisible = visibleTabs.includes(tab.path);
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.path}
                    onClick={() => handleToggleTab(tab.path)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      isVisible
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-gray-50 text-gray-400 border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.name}
                    <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
                      isVisible ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
                    }`}>
                      {isVisible ? "ON" : "OFF"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 min-w-0 p-8 lg:py-10 lg:px-10">
        {children}
      </main>
    </div>
  );
}
