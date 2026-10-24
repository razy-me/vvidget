import { useEffect, useState } from "react";
import type { FC } from "react";
import type { MediaTimeline } from "@/types/media";

export interface TrackProgressProps {
  timeline: MediaTimeline;
  isPlaying: boolean;
  className?: string;
}

export function formatDuration(ms: number): string {
  if (!ms || isNaN(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export const TrackProgress: FC<TrackProgressProps> = ({
  timeline,
  isPlaying,
  className = "",
}) => {
  const { position_ms, duration_ms, last_updated_system_time_ms } = timeline;

  const [currentMs, setCurrentMs] = useState<number>(position_ms);

  useEffect(() => {
    setCurrentMs(position_ms);

    if (!isPlaying || duration_ms <= 0) {
      return;
    }

    let animationFrameId: number;

    const tick = () => {
      const now = Date.now();
      const elapsed = Math.max(0, now - last_updated_system_time_ms);
      const interpolated = Math.min(position_ms + elapsed, duration_ms);
      setCurrentMs(interpolated);

      if (interpolated < duration_ms && isPlaying) {
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [position_ms, duration_ms, last_updated_system_time_ms, isPlaying]);

  const percent = duration_ms > 0 ? Math.min(100, Math.max(0, (currentMs / duration_ms) * 100)) : 0;

  return (
    <div className={`w-full flex flex-col gap-1 select-none ${className}`} data-testid="track-progress">
      <div
        className="w-full h-1 bg-[var(--fluent-stroke)] rounded-full overflow-hidden relative cursor-pointer group"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Playback progress"
      >
        <div
          className="h-full bg-[var(--fluent-accent)] transition-all duration-100 ease-linear rounded-full group-hover:brightness-110"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex justify-between items-center text-[10px] tabular-nums text-[var(--fluent-text-secondary)] font-medium px-0.5">
        <span>{formatDuration(currentMs)}</span>
        <span>{formatDuration(duration_ms)}</span>
      </div>
    </div>
  );
};
