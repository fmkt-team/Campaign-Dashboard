import { GlassCard } from "./glass-card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: number; // % change (+ or -)
}

export function KpiCard({ title, value, description, trend }: KpiCardProps) {
  return (
    <GlassCard className="flex flex-col gap-2 p-5">
      <h3 className="text-sm font-medium text-white/60">{title}</h3>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-bold font-mono text-white">{value}</span>
        {trend !== undefined && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-full",
              trend > 0 ? "bg-white/10 text-white" : "text-white/40 line-through decoration-white/20"
            )}
          >
            {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
          </span>
        )}
      </div>
      {description && <p className="text-xs text-white/40 mt-1">{description}</p>}
    </GlassCard>
  );
}
