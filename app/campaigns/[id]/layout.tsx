"use client";

import { usePathname, useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { motion } from "framer-motion";
import { Share2, Settings2, X, LayoutDashboard, Eye, Megaphone, Heart, ArrowDownToLine, ShoppingCart, BarChart3, ChevronLeft, Palette, RefreshCw, LogOut, Lock, KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRefresh } from "@/lib/refresh-context";
import { useAuth } from "@/lib/auth-context";

const ALL_TABS = [
  { name: "캠페인 개요", path: "/timeline", icon: LayoutDashboard },
  { name: "인지 상세", path: "/awareness", icon: Eye },
  { name: "흥미 상세", path: "/interest", icon: Heart },
  { name: "유입 상세", path: "/conversion", icon: ArrowDownToLine },
  { name: "매출 상세", path: "/sales", icon: ShoppingCart },
  { name: "주간 인사이트", path: "/insights", icon: BarChart3 },
];

export default function CampaignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname  = usePathname();
  const params    = useParams();
  const router    = useRouter();
  const { isAdmin, isMaster, isViewer, viewerCampaignId, isLoading: authLoading, authEmail, logout } = useAuth();
  const [showPwChange, setShowPwChange] = useState(false);

  // 인증 가드: 관리자 또는 해당 캠페인의 뷰어만 허용
  useEffect(() => {
    if (authLoading) return;
    const isViewerForThisCampaign = isViewer && viewerCampaignId === params.id;
    if (!isAdmin && !isViewerForThisCampaign) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isAdmin, isViewer, viewerCampaignId, authLoading, pathname, params.id, router]);

  const campaign = useQuery(api.campaigns.getCampaignById, { id: params.id as Id<"campaigns"> });
  const updateSettings = useMutation(api.campaigns.updateCampaignSettings);
  const generateLinkMutation = useMutation(api.shareLinks.createShareLink);
  const [shareMsg, setShareMsg] = useState("");
  const [showTabManager, setShowTabManager] = useState(false);
  const [symbolColor, setSymbolColor] = useState<"red" | "black" | "white">("red");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const { triggerRefresh } = useRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(false);

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

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setShowToast(false);
    triggerRefresh();
    // API 호출이 완료될 때까지 대기 (3초)
    await new Promise<void>(resolve => setTimeout(resolve, 3000));
    setIsRefreshing(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
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

  return (
    <div className="min-h-screen flex bg-[#F8F9FA]">
      {campaign === undefined && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-50">
          <div className="p-12 text-gray-400">Loading campaign...</div>
        </div>
      )}
      {campaign === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-50">
          <div className="p-12 text-gray-900">Campaign not found.</div>
        </div>
      )}

      {/* ── 좌측 사이드바 ── */}
      <aside className="w-[240px] shrink-0 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen z-40">
        {/* 상단 로고 / 캠페인 이름 */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          {/* Fursys Wordmark - Enlarged */}
          <div className="mb-2">
            <img src="/logo/Fursys_Wordmark_RGB_Black.svg" alt="FURSYS" className="h-32 w-auto" />
          </div>
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs mb-3 transition-colors">
            <ChevronLeft className="w-3 h-3" />
            캠페인 목록
          </Link>
          {campaign && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="relative w-6 h-6 shrink-0 cursor-pointer group" onClick={() => setShowColorPicker(!showColorPicker)}>
                  <img
                    src={`/logo/Fursys_Symbol_RGB_${symbolColor === 'red' ? 'Red' : symbolColor === 'black' ? 'Black' : 'White'}.svg`}
                    alt="Symbol"
                    className="w-6 h-6 object-contain"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 rounded transition-all" />
                </div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight truncate flex-1">{campaign.name}</h1>
              </div>
              {showColorPicker && (
                <div className="flex gap-1.5 mb-2 p-2 bg-gray-50 rounded-lg">
                  {(['red', 'black', 'white'] as const).map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        setSymbolColor(color);
                        setShowColorPicker(false);
                      }}
                      className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                        symbolColor === color ? 'ring-2 ring-gray-900' : ''
                      }`}
                    >
                      <img
                        src={`/logo/Fursys_Symbol_RGB_${color === 'red' ? 'Red' : color === 'black' ? 'Black' : 'White'}.svg`}
                        alt={color}
                        className="w-4 h-4 object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400 font-mono">
                {campaign.startDate} ~ {campaign.endDate || "Ongoing"}
              </p>
            </>
          )}
          {!campaign && (
            <div className="h-8 bg-gray-100 rounded animate-pulse" />
          )}
        </div>

        {/* 탭 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {campaign && filteredTabs.map((tab) => {
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
        {campaign && (
          <div className="px-3 pb-4 space-y-1 border-t border-gray-50 pt-3">
            {/* 관리자 전용 버튼들 */}
            {isAdmin && (
              <>
                <Button onClick={handleRefreshAll} variant="ghost" size="sm" disabled={isRefreshing}
                  className="w-full justify-start text-gray-400 hover:text-gray-700 hover:bg-gray-50 gap-2 text-xs h-9">
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  모든 데이터 업데이트
                </Button>
                <Button onClick={() => setShowTabManager(!showTabManager)} variant="ghost" size="sm"
                  className="w-full justify-start text-gray-400 hover:text-gray-700 hover:bg-gray-50 gap-2 text-xs h-9">
                  <Settings2 className="w-3.5 h-3.5" /> 탭 관리
                </Button>
                <Button onClick={handleShare} variant="ghost" size="sm"
                  className={`w-full justify-start gap-2 text-xs h-9 transition-all ${shareMsg ? "text-green-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"}`}>
                  <Share2 className="w-3.5 h-3.5" />
                  {shareMsg || "뷰어 링크 복사"}
                </Button>
                {isMaster && (
                  <Button onClick={() => router.push("/master")} variant="ghost" size="sm"
                    className="w-full justify-start text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 gap-2 text-xs h-9">
                    <Lock className="w-3.5 h-3.5" /> 계정 관리
                  </Button>
                )}
              </>
            )}

            {/* 공통 (관리자 + 뷰어) */}
            {authEmail && (
              <Button onClick={() => setShowPwChange(true)} variant="ghost" size="sm"
                className="w-full justify-start text-gray-400 hover:text-gray-700 hover:bg-gray-50 gap-2 text-xs h-9">
                <KeyRound className="w-3.5 h-3.5" /> 비밀번호 변경
              </Button>
            )}
            <Button onClick={() => { logout(); router.push("/login"); }} variant="ghost" size="sm"
              className="w-full justify-start text-gray-400 hover:text-red-500 hover:bg-red-50 gap-2 text-xs h-9">
              <LogOut className="w-3.5 h-3.5" />
              {isViewer ? "뷰어 종료" : "로그아웃"}
            </Button>
          </div>
        )}
      </aside>

      {/* ── 탭 관리 패널 (오버레이) ── */}
      {showTabManager && campaign && (
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
        {/* 인증 로딩 중이면 스피너, 인증 완료 후 콘텐츠 표시 */}
        {authLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
          </div>
        ) : children}
      </main>

      {/* ── 업데이트 완료 토스트 ── */}
      {showToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none">
          <Check className="w-4 h-4 text-green-400 shrink-0" />
          업데이트 완료
        </div>
      )}
    </div>
  );
}
