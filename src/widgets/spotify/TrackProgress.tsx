import { useEffect, useState } from "react";
import type { FC, MouseEvent, KeyboardEvent } from "react";
import type { MediaTimeline } from "@/types/media";

export interface TrackProgressProps {
  timeline: MediaTimeline;
  isPlaying: boolean;
  onSeek?: (positionMs: number) => void;
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
  onSeek,
  className = "",
}) => {
  const { position_ms, duration_ms, last_updated_system_time_ms } = timeline;

  const [currentMs, setCurrentMs] = useState<number>(position_ms);

  useEffect(() => {
    setCurrentMs(position_ms);

    if (!isPlaying || duration_ms <= 0) {
      return;
    }

    const updatePosition = () => {
      const now = Date.now();
      const elapsed =
        last_updated_system_time_ms > 0 ? Math.max(0, now - last_updated_system_time_ms) : 0;
      const interpolated = Math.min(position_ms + elapsed, duration_ms);
      setCurrentMs(interpolated);
    };

    updatePosition();
    const timer = setInterval(updatePosition, 250);

    return () => {
      clearInterval(timer);
    };
  }, [position_ms, duration_ms, last_updated_system_time_ms, isPlaying]);

  const percent = duration_ms > 0 ? Math.min(100, Math.max(0, (currentMs / duration_ms) * 100)) : 0;

  const handleSeekClick = (e: MouseEvent<HTMLDivElement>) => {
    if (duration_ms <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, clickX / rect.width)) : 0;
    const newMs = Math.round(ratio * duration_ms);
    setCurrentMs(newMs);
    onSeek?.(newMs);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (duration_ms <= 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const newMs = Math.min(duration_ms, currentMs + 5000);
      setCurrentMs(newMs);
      onSeek?.(newMs);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const newMs = Math.max(0, currentMs - 5000);
      setCurrentMs(newMs);
      onSeek?.(newMs);
    }
  };

  return (
    <div className={`w-full flex flex-col gap-1 select-none ${className}`} data-testid="track-progress">
      <div
        className="w-full py-1 -my-1 cursor-pointer group"
        onClick={handleSeekClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Playback progress"
      >
        <div className="w-full h-1 group-hover:h-1.5 bg-[var(--fluent-stroke)] rounded-full overflow-hidden relative cursor-pointer transition-all duration-150">
          <div
            className="h-full bg-[var(--fluent-accent)] transition-all duration-300 ease-linear rounded-full group-hover:brightness-110"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between items-center text-[10px] tabular-nums text-[var(--fluent-text-secondary)] font-medium px-0.5">
        <span>{formatDuration(currentMs)}</span>
        <span>{formatDuration(duration_ms)}</span>
      </div>
    </div>
  );
};
