"use client";

import { usePathname } from "next/navigation";
import { useState, use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/glass-card";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const TABS = [
  { name: "타임라인", path: "/timeline" },
  { name: "인지 상세", path: "/awareness" },
  { name: "흥미 상세", path: "/interest" },
  { name: "유입 상세", path: "/conversion" },
  { name: "매출 상세", path: "/sales" },
  { name: "주간 인사이트", path: "/insights" },
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
  const generateLinkMutation = useMutation(api.shareLinks.createShareLink);
  const [shareMsg, setShareMsg] = useState("");
  
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

  if (campaign === undefined) {
    return <div className="p-12 text-white/40">Loading campaign...</div>;
  }

  if (campaign === null) {
    return <div className="p-12 text-white">Campaign not found.</div>;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#080808]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="w-full mx-auto px-8 pt-8 pb-0">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-6 h-6 rounded-md shadow-sm" style={{ backgroundColor: campaign.brandColor }} />
            <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
            <span className="text-sm text-white/50 bg-white/5 px-3 py-1 rounded-full border border-white/10">
              {campaign.startDate} ~ {campaign.endDate || "Ongoing"}
            </span>
            <Button 
                onClick={handleShare}
                variant="outline" 
                size="sm" 
                className={`ml-auto bg-transparent border-white/20 text-white hover:bg-white/10 gap-2 transition-all ${
                  shareMsg ? "border-green-500/40 text-green-400" : ""
                }`}
            >
              <Share2 className="w-4 h-4" />
              {shareMsg || "뷰어 링크 복사"}
            </Button>
          </div>

          <nav className="flex gap-8 relative">
            {TABS.map((tab) => {
              const isActive = pathname.includes(tab.path);
              return (
                <Link
                  key={tab.path}
                  href={`/campaigns/${campaign._id}${tab.path}`}
                  className={`pb-4 text-sm font-medium transition-colors relative ${
                    isActive ? "text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {tab.name}
                  {isActive && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                      initial={false}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full mx-auto p-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
