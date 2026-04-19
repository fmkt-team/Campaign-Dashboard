"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/glass-card";
import { KpiCard } from "@/components/kpi-card";
import { use } from "react";

export default function ViewerDashboard({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const validation = useQuery(api.shareLinks.validateToken, { token: resolvedParams.token });

  if (validation === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Loading Dashboard...</div>;
  }

  if (validation.status === "not_found") {
    return <div className="min-h-screen flex items-center justify-center text-red-400">Invalid or unknown link.</div>;
  }

  if (validation.status === "expired") {
    return <div className="min-h-screen flex items-center justify-center text-yellow-400">This share link has expired.</div>;
  }

  const campaign = validation.campaign!;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center gap-4">
          <div className="w-6 h-6 rounded-md shadow-sm" style={{ backgroundColor: campaign.brandColor }} />
          <h1 className="text-2xl font-bold text-white">{campaign.name} <span className="opacity-50 font-normal">| Shared Viewer</span></h1>
          <span className="ml-auto text-sm text-white/50 bg-white/5 px-3 py-1 rounded-full border border-white/10">
            Read Only
          </span>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto p-8 lg:py-10 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Section 1: Overview */}
        <section>
          <h2 className="text-xl font-bold text-white mb-6">Campaign Performance Overview</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="총 기대 조회수" value="324만" trend={12.5} />
            <KpiCard title="총 집행비" value="1.2억" />
            <KpiCard title="방문자 트래픽 확보" value="22.8만" trend={8.1} />
            <KpiCard title="매출/수주액 추정" value="45.2M" trend={2.1} />
          </div>
        </section>

        {/* Section 2: Insights */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4">💡 핵심 인사이트 요약</h2>
          <GlassCard className="bg-[#111111]/80 p-6 border-white/10">
            <ul className="list-disc pl-5 space-y-2 text-white/80 text-sm">
              <li>유튜브 메인 영상 업로드 3일 만에 200만 뷰 조기 달성 (기대 대비 성과 우수)</li>
              <li>공식몰 유입수 상승폭이 전주 대비 크게 개선됨 (유튜브 소스 최적화 성공)</li>
            </ul>
          </GlassCard>
        </section>
        
        {/* Further Sections can be mapped here similarly, combining the admin views into a single scroll page */}
        <section>
          <div className="h-48 flex items-center justify-center border border-dashed border-white/10 rounded-2xl bg-white/5">
            <p className="text-white/30">디테일 차트 및 리포트 영역</p>
          </div>
        </section>

      </main>
    </div>
  );
}
