import type { FC } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

export interface MediaControlsProps {
  isPlaying: boolean;
  canPlayPause: boolean;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  className?: string;
  size?: "sm" | "md";
}

export const MediaControls: FC<MediaControlsProps> = ({
  isPlaying,
  canPlayPause,
  canSkipNext,
  canSkipPrevious,
  onPlayPause,
  onNext,
  onPrevious,
  className = "",
  size = "md",
}) => {
  const isSm = size === "sm";

  return (
    <div
      className={`flex items-center justify-center gap-2 select-none ${className}`}
      data-testid="media-controls"
    >
      {/* Previous Track */}
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canSkipPrevious}
        aria-label="Previous track"
        className={`p-1.5 rounded-full text-[var(--fluent-text-secondary)] transition-all duration-150 hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-bg)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
          isSm ? "w-7 h-7" : "w-8 h-8"
        } flex items-center justify-center`}
      >
        <SkipBack className={isSm ? "w-3.5 h-3.5" : "w-4 h-4"} />
      </button>

      {/* Play / Pause Toggle - Native Windows 11 Glass Button (36-40px) */}
      <button
        type="button"
        onClick={onPlayPause}
        disabled={!canPlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
        className={`rounded-full bg-[var(--fluent-accent)] text-white shadow-md ring-1 ring-white/10 transition-all duration-150 hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center ${
          isSm ? "w-8 h-8 p-1.5" : "w-10 h-10 p-2"
        }`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Next Track */}
      <button
        type="button"
        onClick={onNext}
        disabled={!canSkipNext}
        aria-label="Next track"
        className={`p-1.5 rounded-full text-[var(--fluent-text-secondary)] transition-all duration-150 hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-bg)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
          isSm ? "w-7 h-7" : "w-8 h-8"
        } flex items-center justify-center`}
      >
        <SkipForward className={isSm ? "w-3.5 h-3.5" : "w-4 h-4"} />
      </button>
    </div>
  );
};
