"use client";

import { use, useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { GlassCard } from "@/components/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, UploadCloud, FileSpreadsheet, RefreshCw, Settings2, Pencil, Trash, Link as LinkIcon } from "lucide-react";
import { fetchSpreadsheetData } from "@/lib/google-sheets";
import * as xlsx from "xlsx";
import { format, startOfWeek, parseISO } from "date-fns";

type ViewMode = "daily" | "weekly" | "monthly";

function processNumber(val: any) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(num) ? 0 : num;
}

function processDate(val: any) {
  if (!val) return "1970-01-01";
  const str = String(val).trim();
  const match = str.match(/(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const y = match[1].length === 2 ? `20${match[1]}` : match[1];
    const m = match[2].padStart(2, "0");
    const d = match[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return str;
}

function groupDigitalKpis(data: any[], viewMode: ViewMode) {
  const groups = new Map<string, any>();
  for (const row of data) {
    if (!row.date) continue;
    let key = row.date;
    try {
      if (viewMode === "weekly") key = format(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      else if (viewMode === "monthly") key = row.date.substring(0, 7);
    } catch (e) {}
    const combinedKey = `${key}_${row.medium}`;
    if (!groups.has(combinedKey)) {
      groups.set(combinedKey, { dateLabel: key, medium: row.medium, spend: 0, impressions: 0, views: 0, clicks: 0 });
    }
    const g = groups.get(combinedKey);
    g.spend += row.spend;
    g.impressions += row.impressions;
    g.views += row.views;
    g.clicks += row.clicks;
  }
  return Array.from(groups.values()).map(g => ({
    ...g,
    cpv: g.views > 0 ? Math.round(g.spend / g.views) : 0,
    ctr: g.impressions > 0 ? Number(((g.clicks / g.impressions) * 100).toFixed(2)) : 0,
    vtr: g.impressions > 0 ? Number(((g.views / g.impressions) * 100).toFixed(2)) : 0,
  })).sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
}

function groupViral(data: any[], viewMode: ViewMode) {
  return data.map(row => {
    let key = row.date || "1970-01-01";
    try {
      if (viewMode === "weekly") key = format(startOfWeek(parseISO(row.date), { weekStartsOn: 1 }), "yyyy-MM-dd (주차)");
      else if (viewMode === "monthly") key = row.date.substring(0, 7) + " (월)";
    } catch (e) {}
    return { ...row, dateLabel: key };
  }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

export default function AwarenessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = id as Id<"campaigns">;

  const digitalKpis = useQuery(api.awareness.getDigitalKpis, { campaignId }) ?? [];
  const viralContents = useQuery(api.awareness.getViralContents, { campaignId }) ?? [];

  const syncDigitalKpis = useMutation(api.awareness.syncDigitalKpis);
  const syncViralContents = useMutation(api.awareness.syncViralContents);
  const updateViralRow = useMutation(api.awareness.updateViralRow);
  const deleteViralRow = useMutation(api.awareness.deleteViralRow);

  const youtubeVideos = useQuery(api.awareness.getYouTubeVideos, { campaignId }) ?? [];
  const addYouTubeVideo = useMutation(api.awareness.addYouTubeVideo);
  const updateYouTubeVideo = useMutation(api.awareness.updateYouTubeVideo);
  const deleteYouTubeVideo = useMutation(api.awareness.deleteYouTubeVideo);

  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");
  const [isAddingYoutube, setIsAddingYoutube] = useState(false);

  const [filterMonth, setFilterMonth] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");

  const [showConfig, setShowConfig] = useState<{ type: "digital" | "viral"; source: "sheet" | "excel" } | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");

  // 바이럴 매핑 상태
  const [previewData, setPreviewData] = useState<any[][] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [isGuessingCols, setIsGuessingCols] = useState(false);

  // 개별 편집 상태
  const [editingViralId, setEditingViralId] = useState<string | null>(null);
  const [editViralForm, setEditViralForm] = useState<any>({});
  const [isFetchingUrl, setIsFetchingUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI로 매체 퍼포먼스 자동 분석 ──────────────────────────────
  const runDigitalAI = async (data: any[][]) => {
    setIsSyncing(true);
    setSyncStatus("AI가 매체 데이터를 분석 중...");
    try {
      const payload = data.filter(r => r.some(c => c !== "")).slice(0, 200);
      const res = await fetch("/api/parse-sheet-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload, type: "digital" }),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "AI 분석 실패");
      if (!parsed.rows) throw new Error("AI 응답 형식 오류");

      const rows = parsed.rows.map((r: any) => ({
        date: r.date || "1970-01-01",
        medium: r.medium || "-",
        spend: processNumber(r.spend),
        impressions: processNumber(r.impressions),
        views: processNumber(r.views),
        clicks: processNumber(r.clicks),
        cpv: processNumber(r.views) > 0 ? processNumber(r.spend) / processNumber(r.views) : 0,
        ctr: processNumber(r.impressions) > 0 ? (processNumber(r.clicks) / processNumber(r.impressions)) * 100 : 0,
        vtr: processNumber(r.impressions) > 0 ? (processNumber(r.views) / processNumber(r.impressions)) * 100 : 0,
        recordedAt: Date.now(),
      }));
      await syncDigitalKpis({ campaignId, rows });
      setSyncStatus(`✅ ${rows.length}개 행 동기화 완료!`);
      setTimeout(() => setSyncStatus(""), 3000);
      setShowConfig(null);
    } catch (e: any) {
      alert("AI 매체 분석 오류: " + e.message);
      setSyncStatus("");
    } finally {
      setIsSyncing(false);
    }
  };

  // ── 바이럴 컬럼 AI 추론 후 매핑 팝업 열기 ────────────────────
  const openViralMapper = async (data: any[][]) => {
    setPreviewData(data);
    setMapping({});
    setHeaderRowIdx(0);
    setIsGuessingCols(true);
    setShowConfig(null);
    try {
      const sample = data.slice(0, 15);
      const res = await fetch("/api/parse-sheet-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: sample, type: "viral", mode: "guess_columns" }),
      });
      const parsed = await res.json();
      if (parsed.headerRowIndex !== undefined) {
        setHeaderRowIdx(parsed.headerRowIndex);
      }
      if (parsed.mapping) {
        const stringMap: Record<string, string> = {};
        Object.entries(parsed.mapping).forEach(([k, v]) => {
          if (v !== null && v !== undefined) stringMap[k] = String(v);
        });
        setMapping(stringMap);
      }
    } catch (e) {
      console.warn("AI column guess failed:", e);
    } finally {
      setIsGuessingCols(false);
    }
  };

  // ── 구글 시트 동기화 ──────────────────────────────────────────
  const handleSheetSync = async (type: "digital" | "viral") => {
    if (!sheetUrl) return alert("스프레드시트 주소를 입력해주세요.");
    setIsSyncing(true);
    try {
      const res = await fetchSpreadsheetData(sheetUrl);
      if (!res.success || !res.data) throw new Error(res.error || "데이터 없음");
      if (type === "digital") {
        await runDigitalAI(res.data);
      } else {
        await openViralMapper(res.data);
      }
    } catch (e: any) {
      alert("구글 시트 연동 에러: " + e.message);
    } finally {
      setIsSyncing(false);
      setSheetUrl("");
    }
  };

  // ── 엑셀 업로드 ───────────────────────────────────────────────
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "digital" | "viral") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: "binary", cellText: false, cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd" }) as any[][];
        if (type === "digital") {
          await runDigitalAI(data);
        } else {
          await openViralMapper(data);
        }
      } catch (err: any) {
        alert("엑셀 파싱 에러: " + err.message);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── 바이럴 매핑 확정 동기화 ──────────────────────────────────
  const handleConfirmMapping = async () => {
    if (!previewData) return;
    setIsSyncing(true);
    try {
      const validRows = previewData.slice(headerRowIdx + 1).filter(row =>
        Object.values(mapping).some(colIdx => {
          const v = row[parseInt(colIdx)];
          return v !== undefined && v !== "";
        })
      );
      let lastKnownDate = "";
      let lastKnownPlatform = "-";
      let lastKnownCreator = "-";

      const rows = validRows.map(cols => {
        let dateStr = mapping["date"] ? processDate(cols[parseInt(mapping["date"])]) : "";
        if (dateStr === "1970-01-01") dateStr = "";
        if (dateStr === "" && mapping["date"]) dateStr = lastKnownDate; else lastKnownDate = dateStr;

        let platform = mapping["platform"] ? String(cols[parseInt(mapping["platform"])] || "").trim() : "";
        if (!platform || platform === "-") platform = lastKnownPlatform; else lastKnownPlatform = platform;

        const rawUrl = mapping["url"] ? String(cols[parseInt(mapping["url"])] || "").trim() : "";

          if (rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) {
            platform = "YouTube";
          } else if (rawUrl.includes("instagram.com")) {
            platform = "Instagram";
          } else if (rawUrl.includes("blog.naver.com") || rawUrl.includes("naver.com")) {
            platform = "Naver Blog";
          }

        let creator = mapping["creator"] ? String(cols[parseInt(mapping["creator"])] || "").trim() : "";
        if (!creator || creator === "-") creator = lastKnownCreator; else lastKnownCreator = creator;

        return {
          date: dateStr,
          platform: platform || "-",
          creator: creator || "-",
          title: "-", // title은 더 이상 시트에서 매핑하지 않음
          views: 0,
          likes: 0,
          comments: 0,
          url: rawUrl,
          thumbnailUrl: undefined,
        };
      });

      setSyncStatus("업로드된 URL의 성과 데이터를 AI가 실시간으로 수집하고 있습니다...");
      
      const enrichedRows = await Promise.all(rows.map(async (row) => {
        if (!row.url) return row;
        try {
          const res = await fetch("/api/fetch-sns-stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: row.url }),
          });
          const data = await res.json();
          if (data.success && data.stats) {
            row.views = data.stats.views !== undefined ? processNumber(data.stats.views) : 0;
            row.likes = data.stats.likes !== undefined ? processNumber(data.stats.likes) : 0;
            row.comments = data.stats.comments !== undefined ? processNumber(data.stats.comments) : 0;
            if (data.stats.title && data.stats.title !== "-") row.title = data.stats.title;
            if (data.stats.thumbnailUrl) row.thumbnailUrl = data.stats.thumbnailUrl;
            if (data.stats.date && row.date === "") row.date = data.stats.date;
          }
        } catch(e) {
           console.error("fetchSnsStats for sync failed:", e);
        }
        return row;
      }));

      setSyncStatus("수집 완료! DB에 안전하게 저장 중입니다...");
      await syncViralContents({ campaignId, rows: enrichedRows });
    } catch (e: any) {
      alert("동기화 실패: " + e.message);
    } finally {
      setIsSyncing(false);
      setPreviewData(null);
      setMapping({});
    }
  };

  const startEditViral = (row: any) => {
    setEditingViralId(row._id);
    setEditViralForm({ ...row });
  };

  const saveEditViral = async () => {
    if (!editingViralId) return;
    await updateViralRow({
      viralId: editingViralId as Id<"viralContents">,
      updates: {
        url: editViralForm.url,
        creator: editViralForm.creator,
        views: processNumber(editViralForm.views),
        likes: processNumber(editViralForm.likes),
        comments: processNumber(editViralForm.comments),
      }
    });
    setEditingViralId(null);
  };

  const handleFetchSnsStats = async (rowId: string, url: string) => {
    if (!url) {
      alert("URL이 없습니다.");
      return;
    }
    setIsFetchingUrl(rowId);
    try {
      const res = await fetch("/api/fetch-sns-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success && data.stats) {
        await updateViralRow({ 
          viralId: rowId as Id<"viralContents">, 
          updates: { 
            views: data.stats.views, 
            likes: data.stats.likes, 
            comments: data.stats.comments,
            title: data.stats.title !== "-" ? data.stats.title : undefined,
            thumbnailUrl: data.stats.thumbnailUrl,
            date: data.stats.date,
          } 
        });
      } else {
        alert(data.error || "수집 실패");
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setIsFetchingUrl(null);
    }
  };

  const handleAddYoutube = async () => {
    if (!newYoutubeUrl) return;
    setIsAddingYoutube(true);
    try {
      const res = await fetch("/api/fetch-sns-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newYoutubeUrl }),
      });
      const data = await res.json();
      if (data.success && data.stats) {
        let yId = "-";
        const idMatch = newYoutubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([^&?]+)/);
        if (idMatch) yId = idMatch[1];
  
        await addYouTubeVideo({
          campaignId,
          youtubeId: yId,
          title: data.stats.title !== "-" ? data.stats.title : "제목 없음",
          thumbnailUrl: data.stats.thumbnailUrl || "",
          views: data.stats.views || 0,
          likes: data.stats.likes || 0,
          comments: data.stats.comments || 0,
          likeRate: 0,
          uploadDate: data.stats.date || new Date().toISOString().split('T')[0],
        });
        setNewYoutubeUrl("");
      } else {
        alert(data.error || "수집 실패");
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setIsAddingYoutube(false);
    }
  };

  // ── 매핑 드롭다운 렌더 ────────────────────────────────────────
  const numCols = previewData ? Math.max(...previewData.slice(0, 10).map(r => r.length), 0) : 0;

  // 각 컬럼의 첫 번째 비어있지 않은 샘플값들 미리 계산
  // 각 컬럼의 헤더 명 (AI가 찾아낸 headerRowIdx 활용)
  const colSamples = Array.from({ length: numCols }).map((_, i) => {
    const sample = previewData?.[headerRowIdx]?.[i];
    return sample ? String(sample).substring(0, 15) : "(빈값)";
  });

  const renderMappingSelect = (field: string, label: string, required = false) => {
    const isDetected = mapping[field] !== undefined;
    return (
      <div key={field} className={`flex flex-col gap-1 p-2 rounded border ${
        !isDetected && required ? "border-amber-500/40 bg-amber-500/5" : "border-gray-100 bg-gray-50"
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-gray-900/80 text-xs font-medium">{label}</span>
          {isDetected
            ? <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">✓ 자동 감지</span>
            : <span className="text-[10px] bg-gray-100 text-gray-900/40 px-1.5 py-0.5 rounded">{required ? "⚠ 필수" : "선택"}</span>
          }
        </div>
        <select
          value={mapping[field] ?? ""}
          onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
          className="w-full bg-white text-gray-900 border border-gray-200 rounded p-1.5 text-xs outline-none"
        >
          <option value="">-- 매핑 안 함 (공란) --</option>
          {Array.from({ length: numCols }).map((_, i) => (
            <option key={i} value={i}>{`${i + 1}열 [${String.fromCharCode(65 + i)}] — ${colSamples[i]}`}</option>
          ))}
        </select>
      </div>
    );
  };

  // ── UI 렌더 ────────────────────────────────────────────────────
  const groupedDigital = groupDigitalKpis(digitalKpis, "daily");
  const groupedViral = groupViral(viralContents, "daily");

  const viralMonths = Array.from(new Set(groupedViral.map(v => v.date?.substring(0, 7)))).filter(Boolean).sort().reverse();
  const viralPlatforms = Array.from(new Set(groupedViral.map(v => v.platform))).filter(Boolean).sort();

  const filteredViral = groupedViral.filter(v => {
    if (filterMonth !== "all" && v.date?.substring(0, 7) !== filterMonth) return false;
    if (filterPlatform !== "all" && v.platform !== filterPlatform) return false;
    return true;
  });

  const viralTotalViews = filteredViral.reduce((acc, v) => acc + (v.views || 0), 0);
  const viralTotalLikes = filteredViral.reduce((acc, v) => acc + (v.likes || 0), 0);
  const viralTotalComments = filteredViral.reduce((acc, v) => acc + (v.comments || 0), 0);

  const ytTotalViews = youtubeVideos.reduce((acc, v) => acc + (v.views || 0), 0);
  const ytTotalLikes = youtubeVideos.reduce((acc, v) => acc + (v.likes || 0), 0);
  const ytTotalComments = youtubeVideos.reduce((acc, v) => acc + (v.comments || 0), 0);

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── 매체 퍼포먼스 ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">매체 퍼포먼스 모니터링</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-gray-200 text-gray-900/80 hover:bg-gray-100"
              onClick={() => setShowConfig({ type: "digital", source: "excel" })}>
              <UploadCloud className="w-4 h-4 mr-2" /> 엑셀 파일
            </Button>
            <Button size="sm" className="bg-[#0F9D58] hover:bg-[#0F9D58]/80 text-gray-900 border-0"
              onClick={() => setShowConfig({ type: "digital", source: "sheet" })}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> 구글 시트
            </Button>
          </div>
        </div>

        {showConfig?.type === "digital" && (
          <GlassCard className="p-4 mb-4 border-dashed bg-gray-50 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">매체 데이터 소스 연동</span>
              <button onClick={() => setShowConfig(null)}><X className="w-4 h-4 text-gray-900/50" /></button>
            </div>
            {showConfig.source === "sheet" ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                    placeholder="스프레드시트 URL 복사/붙여넣기..."
                    className="bg-gray-50 border-gray-100 text-xs text-gray-900" />
                  <Button size="sm" onClick={() => handleSheetSync("digital")} disabled={isSyncing}
                    className="bg-white text-black whitespace-nowrap">
                    {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "AI 분석"}
                  </Button>
                </div>
                <p className="text-[10px] text-gray-900/40">* URL 입력 → AI 자동 분석 → 매핑 없이 바로 저장됩니다.</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef}
                  onChange={e => handleExcelUpload(e, "digital")}
                  className="text-xs text-gray-900/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-900" />
              </div>
            )}
            {isSyncing && syncStatus && (
              <div className="mt-3 flex items-center gap-2 text-xs text-indigo-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{syncStatus}</span>
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="p-0 overflow-hidden min-h-[150px]">
          {groupedDigital.length === 0 ? (
            <div className="flex items-center justify-center h-[150px] text-gray-900/30 text-sm">
              구글 시트 또는 엑셀 파일을 연동하면 AI가 자동으로 분석합니다.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="text-gray-900/60">기간 ({viewMode})</TableHead>
                  <TableHead className="text-gray-900/60">매체명</TableHead>
                  <TableHead className="text-gray-900/60 text-right">집행 비용</TableHead>
                  <TableHead className="text-gray-900/60 text-right">노출수</TableHead>
                  <TableHead className="text-gray-900/60 text-right">조회수</TableHead>
                  <TableHead className="text-gray-900/60 text-right">클릭수</TableHead>
                  <TableHead className="text-gray-900/60 text-right">CPV</TableHead>
                  <TableHead className="text-gray-900/60 text-right">CTR / VTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedDigital.map((row, i) => (
                  <TableRow key={i} className="border-gray-100 hover:bg-gray-50 text-sm">
                    <TableCell className="font-mono text-gray-900/60">{row.dateLabel}</TableCell>
                    <TableCell className="font-medium text-gray-900">{row.medium}</TableCell>
                    <TableCell className="text-right text-gray-900/80">{row.spend.toLocaleString()}원</TableCell>
                    <TableCell className="text-right text-gray-900/80">{row.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-gray-900">{row.views.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-gray-900">{row.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-gray-900/80">₩{row.cpv.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-indigo-400">{row.ctr}% / {row.vtr}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </div>

      {/* ── 캠페인 연계 광고 영상 (유튜브 등) ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">캠페인 연계 광고 영상</h2>
          <div className="flex gap-2 items-center">
            <Input 
              value={newYoutubeUrl} 
              onChange={e => setNewYoutubeUrl(e.target.value)} 
              placeholder="유튜브 영상 URL 입력..."
              className="h-8 w-64 bg-gray-50 border-gray-100 text-xs text-gray-900"
            />
            <Button size="sm" onClick={handleAddYoutube} disabled={isAddingYoutube} className="h-8 bg-blue-600 hover:bg-blue-500 text-gray-900">
              {isAddingYoutube ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <LinkIcon className="w-3 h-3 mr-1" />} 
              추가/수집
            </Button>
          </div>
        </div>
        
        <GlassCard className="p-0 overflow-hidden mb-8">
          {youtubeVideos.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-gray-900/30 text-sm">
              우측 상단에 연계될 유튜브 영상 링크를 입력하여 영상을 추가하세요.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="text-gray-900/60">업로드</TableHead>
                  <TableHead className="text-gray-900/60">플랫폼</TableHead>
                  <TableHead className="text-gray-900/60">콘텐츠 제목</TableHead>
                  <TableHead className="text-right text-indigo-400">
                    <div className="flex flex-col">
                      <span className="text-gray-900/60 text-xs font-normal">조회수</span>
                      <span className="font-bold text-sm">{ytTotalViews.toLocaleString()}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-right text-indigo-400">
                    <div className="flex flex-col">
                      <span className="text-gray-900/60 text-xs font-normal">반응 (좋아요 / 댓글)</span>
                      <span className="font-bold text-sm">👍 {ytTotalLikes.toLocaleString()} / 💬 {ytTotalComments.toLocaleString()}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-gray-900/60 text-center w-[100px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {youtubeVideos.map((vid: any) => (
                  <TableRow key={vid._id} className="border-gray-100 hover:bg-gray-50 text-sm h-[72px]">
                    <TableCell className="font-mono text-gray-900/60">{vid.uploadDate}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-[10px] font-bold">YT</span>
                    </TableCell>
                    <TableCell className="text-gray-900/80 max-w-[200px]">
                      <div className="flex items-center gap-3">
                        {vid.thumbnailUrl ? (
                          <img src={`/api/proxy-image?url=${encodeURIComponent(vid.thumbnailUrl)}`} referrerPolicy="no-referrer" alt="thumbnail" className="w-14 h-14 object-cover rounded-md shadow-md border border-gray-100 shrink-0" />
                        ) : (
                          <div className="w-14 h-14 bg-gray-50 rounded-md flex items-center justify-center shrink-0 border border-gray-100 text-gray-900/20 text-[10px]">No Img</div>
                        )}
                        <div className="flex flex-col gap-1 overflow-hidden">
                          <div className="font-bold text-xs truncate max-w-[130px] leading-tight" title={vid.title}>{vid.title}</div>
                          {vid.youtubeId !== "-" && <a href={`https://youtube.com/watch?v=${vid.youtubeId}`} target="_blank" rel="noreferrer" className="text-[10px] hover:underline text-blue-400 font-medium truncate">🔗 영상 보러가기</a>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-900">{vid.views.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-gray-900/60">👍 {vid.likes.toLocaleString()} / 💬 {vid.comments.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <button onClick={() => { if(confirm("삭제하시겠습니까?")) deleteYouTubeVideo({ videoId: vid._id })}} className="p-1 rounded hover:bg-red-500/20 text-red-500/70"><Trash className="w-4 h-4" /></button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </div>

      {/* ── 바이럴 컨텐츠 ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900">바이럴 컨텐츠 성과</h2>
            <div className="flex items-center gap-2">
              <select className="bg-gray-50 border border-gray-100 text-gray-900 text-xs rounded p-1.5 outline-none" 
                value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                <option value="all">전체 월</option>
                {viralMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-gray-50 border border-gray-100 text-gray-900 text-xs rounded p-1.5 outline-none" 
                value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
                <option value="all">전체 플랫폼</option>
                {viralPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-gray-200 text-gray-900/80 hover:bg-gray-100"
              onClick={() => setShowConfig({ type: "viral", source: "excel" })}>
              <UploadCloud className="w-4 h-4 mr-2" /> 엑셀 파일
            </Button>
            <Button size="sm" className="bg-[#0F9D58] hover:bg-[#0F9D58]/80 text-gray-900 border-0"
              onClick={() => setShowConfig({ type: "viral", source: "sheet" })}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> 구글 시트
            </Button>
          </div>
        </div>

        {showConfig?.type === "viral" && (
          <GlassCard className="p-4 mb-4 border-dashed bg-gray-50 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">바이럴 데이터 소스 연동</span>
              <button onClick={() => setShowConfig(null)}><X className="w-4 h-4 text-gray-900/50" /></button>
            </div>
            {showConfig.source === "sheet" ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                    placeholder="스프레드시트 URL 복사/붙여넣기..."
                    className="bg-gray-50 border-gray-100 text-xs text-gray-900" />
                  <Button size="sm" onClick={() => handleSheetSync("viral")} disabled={isSyncing}
                    className="bg-white text-black whitespace-nowrap">
                    {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "가져오기"}
                  </Button>
                </div>
                <p className="text-[10px] text-gray-900/40">* AI가 컬럼을 자동 감지하고 매핑 미리보기를 생성합니다.</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef}
                  onChange={e => handleExcelUpload(e, "viral")}
                  className="text-xs text-gray-900/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-900" />
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="p-0 overflow-hidden min-h-[150px]">
          {groupedViral.length === 0 ? (
            <div className="flex items-center justify-center h-[150px] text-gray-900/30 text-sm">
              데이터를 연동해 주세요.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="text-gray-900/60">업로드 (daily)</TableHead>
                  <TableHead className="text-gray-900/60">플랫폼</TableHead>
                  <TableHead className="text-gray-900/60">크리에이터</TableHead>
                  <TableHead className="text-gray-900/60">콘텐츠 제목</TableHead>
                  <TableHead className="text-right text-indigo-400">
                    <div className="flex flex-col">
                      <span className="text-gray-900/60 text-xs font-normal">조회수</span>
                      <span className="font-bold text-sm">{viralTotalViews.toLocaleString()}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-right text-indigo-400">
                    <div className="flex flex-col">
                      <span className="text-gray-900/60 text-xs font-normal">반응 (좋아요 / 댓글)</span>
                      <span className="font-bold text-sm">👍 {viralTotalLikes.toLocaleString()} / 💬 {viralTotalComments.toLocaleString()}</span>
                    </div>
                  </TableHead>
                  <TableHead className="text-gray-900/60 text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredViral.map(row => {
                  const isEditing = editingViralId === row._id;
                  return (
                  <TableRow key={row._id} className="border-gray-100 hover:bg-gray-50 text-sm">
                    <TableCell className="text-gray-900/50 font-mono">{row.dateLabel}</TableCell>
                    <TableCell>
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-900/80">{row.platform}</span>
                    </TableCell>
                    <TableCell className="font-medium text-gray-900">
                      {isEditing ? <Input value={editViralForm.creator} onChange={e => setEditViralForm({...editViralForm, creator: e.target.value})} className="h-6 text-xs w-20 bg-transparent border-gray-200"/> : row.creator}
                    </TableCell>
                    <TableCell className="text-gray-900/80 max-w-[200px]">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <Input placeholder="URL" value={editViralForm.url || ""} onChange={e => setEditViralForm({...editViralForm, url: e.target.value})} className="h-6 text-xs bg-transparent border-gray-200"/>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {row.thumbnailUrl ? (
                            <img src={`/api/proxy-image?url=${encodeURIComponent(row.thumbnailUrl)}`} referrerPolicy="no-referrer" alt="thumbnail" className="w-14 h-14 object-cover rounded-md shadow-md border border-gray-100 shrink-0" />
                          ) : (
                            <div className="w-14 h-14 bg-gray-50 rounded-md flex items-center justify-center shrink-0 border border-gray-100 text-gray-900/20 text-[10px]">No Img</div>
                          )}
                          <div className="flex flex-col gap-1 overflow-hidden">
                            <div className="font-bold text-xs truncate max-w-[130px] leading-tight" title={row.title !== "-" ? row.title : "제목 없음"}>
                              {row.title !== "-" ? row.title : "제목 없음"}
                            </div>
                            {row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="text-[10px] hover:underline text-blue-400 font-medium truncate">🔗 컨텐츠 보러가기</a> : null}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-900">
                      {isEditing ? <Input value={editViralForm.views} onChange={e => setEditViralForm({...editViralForm, views: e.target.value})} className="h-6 text-xs w-16 text-right bg-transparent border-gray-200 ml-auto"/> : row.views.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-900/60">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                           <Input placeholder="Likes" value={editViralForm.likes} onChange={e => setEditViralForm({...editViralForm, likes: e.target.value})} className="h-6 text-xs w-12 text-right bg-transparent border-gray-200"/>
                           <Input placeholder="Comms" value={editViralForm.comments} onChange={e => setEditViralForm({...editViralForm, comments: e.target.value})} className="h-6 text-xs w-12 text-right bg-transparent border-gray-200"/>
                        </div>
                      ) : (
                        <>👍 {row.likes.toLocaleString()} / 💬 {row.comments.toLocaleString()}</>
                      )}
                    </TableCell>
                    <TableCell className="text-center w-[120px]">
                      <div className="flex items-center justify-center gap-2">
                        {isEditing ? (
                          <>
                            <button onClick={saveEditViral} className="p-1 rounded hover:bg-gray-100 text-green-400"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingViralId(null)} className="p-1 rounded hover:bg-gray-100 text-gray-900/50"><X className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <>
                            {row.url && (
                              <button onClick={() => handleFetchSnsStats(row._id, row.url)} className="p-1 rounded hover:bg-gray-100 text-blue-400" title="자동 수집">
                                {isFetchingUrl === row._id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                              </button>
                            )}
                            <button onClick={() => startEditViral(row)} className="p-1 rounded hover:bg-gray-100 text-gray-900/50"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => { if(confirm("삭제하시겠습니까?")) deleteViralRow({ viralId: row._id })}} className="p-1 rounded hover:bg-red-500/20 text-red-500/70"><Trash className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </div>

      {/* ── 바이럴 컬럼 매핑 모달 ── */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-[820px] max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg text-gray-900 font-bold flex items-center gap-2">
                <Settings2 className="w-5 h-5" /> 바이럴 컨텐츠 컬럼 매핑
              </h3>
              <button onClick={() => { setPreviewData(null); setMapping({}); }}>
                <X className="w-5 h-5 text-gray-900/50 hover:text-gray-900" />
              </button>
            </div>

            {isGuessingCols ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-indigo-400" />
                <p className="text-sm text-gray-900/60">AI가 시트 구조를 분석하고 컬럼을 자동 감지 중...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-900/40 mb-5">
                  AI가 아래와 같이 열을 자동 감지했습니다. 확인 후 필요 시 수정해주세요.
                </p>
                <div className="flex gap-6 overflow-hidden flex-1">
                  {/* 매핑 컨트롤 */}
                  <div className="w-1/2 flex flex-col gap-2 overflow-y-auto pr-2">
                    {renderMappingSelect("date", "업로드 일자 (Date)", false)}
                    {renderMappingSelect("platform", "플랫폼/채널 (Platform)", false)}
                    {renderMappingSelect("creator", "크리에이터 (Creator)", true)}
                    {renderMappingSelect("url", "게시물 URL (Link)")}
                  </div>

                  {/* 데이터 미리보기 */}
                  <div className="w-1/2 flex flex-col border-l border-gray-100 pl-6 overflow-y-auto">
                    <span className="text-gray-900/60 text-xs font-semibold uppercase tracking-wider mb-2">
                      데이터 미리보기 (상위 5행)
                    </span>
                    <div className="bg-gray-100 p-3 rounded-lg border border-white/5 overflow-x-auto">
                      <table className="text-xs text-gray-900/70 w-full text-left border-collapse">
                        <thead>
                          <tr>
                            {Array.from({ length: Math.min(numCols, 12) }).map((_, i) => (
                              <th key={i} className="border-b border-gray-100 pb-2 px-1 text-gray-900/40 font-mono font-normal whitespace-nowrap">
                                {i + 1}열({String.fromCharCode(65 + i)})
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((row, rIdx) => (
                            <tr key={rIdx}>
                              {Array.from({ length: Math.min(numCols, 12) }).map((_, cIdx) => (
                                <td key={cIdx} className="py-1.5 px-1 border-b border-white/5 truncate max-w-[80px]">
                                  {row[cIdx] !== undefined ? String(row[cIdx]) : ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {numCols > 12 && (
                        <div className="text-gray-900/30 text-xs mt-2 text-center">... (이후 열 생략)</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100">
                  <Button variant="ghost" onClick={() => { setPreviewData(null); setMapping({}); }}
                    className="text-gray-900/60">취소</Button>
                  <Button onClick={handleConfirmMapping}
                    disabled={Object.values(mapping).length === 0 || isSyncing}
                    className="bg-white text-black hover:bg-gray-800">
                    {isSyncing
                      ? <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      : <Check className="w-4 h-4 mr-2" />}
                    매핑 확인 및 데이터 동기화
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
