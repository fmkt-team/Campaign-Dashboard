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
      <h3 className="text-sm font-medium text-gray-400">{title}</h3>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-bold font-mono text-gray-900">{value}</span>
        {trend !== undefined && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-full",
              trend > 0 ? "bg-gray-50 text-gray-900" : "text-gray-400 line-through decoration-white/20"
            )}
          >
            {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
          </span>
        )}
      </div>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </GlassCard>
  );
}
