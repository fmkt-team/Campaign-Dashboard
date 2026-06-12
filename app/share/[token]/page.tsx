"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { Lock } from "lucide-react";

export default function ShareGateway() {
  const params     = useParams();
  const token      = params.token as string;
  const { setViewerSession } = useAuth();

  const validation = useQuery(api.shareLinks.validateToken, { token });

  useEffect(() => {
    if (!validation) return;

    if (validation.status === "valid" && validation.campaign) {
      const campaignId = validation.campaign._id as string;
      // 뷰어 세션을 localStorage에 저장한 뒤 full reload로 이동
      // (router.replace는 React state가 commit되기 전에 새 layout을 렌더링하여
      //  인증 가드가 isViewer=false로 실행되는 race condition 발생)
      setViewerSession(campaignId, token);
      window.location.href = `/campaigns/${campaignId}/timeline`;
    }
  }, [validation, token, setViewerSession]);

  // ── 로딩 ──────────────────────────────────────────────────────
  if (validation === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  if (validation.status === "not_found") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FA] gap-4">
        <Lock className="w-10 h-10 text-gray-300" />
        <p className="text-gray-500 font-medium">유효하지 않은 공유 링크입니다.</p>
      </div>
    );
  }

  if (validation.status === "expired") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FA] gap-4">
        <Lock className="w-10 h-10 text-yellow-400" />
        <p className="text-gray-500 font-medium">링크 유효기간이 만료되었습니다.</p>
        <p className="text-gray-400 text-sm">관리자에게 새 링크를 요청하세요.</p>
      </div>
    );
  }

  // 리디렉션 중
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
    </div>
  );
}
