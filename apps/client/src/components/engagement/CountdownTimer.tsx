import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function CountdownTimer({
  targetTime,
  label = "Resets in",
  compact = false
}: {
  targetTime: string;
  label?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const parts = useMemo(() => formatRemaining(new Date(targetTime).getTime() - now), [now, targetTime]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-black/30 px-3 py-2 text-white shadow-sm backdrop-blur ${compact ? "text-xs" : "text-sm"}`}>
      <Clock size={compact ? 14 : 16} className="text-amber-200" />
      <span className="font-black uppercase tracking-[0.14em] text-amber-100">{label}</span>
      <span className="font-black">{parts}</span>
    </div>
  );
}

function formatRemaining(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}
