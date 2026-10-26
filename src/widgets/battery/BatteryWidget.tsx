import { useState, useMemo, type FC } from "react";
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryWarning,
  AlertTriangle,
  Sliders,
  RefreshCw,
  Monitor,
  X,
  Zap,
} from "lucide-react";
import { Card, Badge, ProgressBar } from "@/components/ui";
import { useBattery, openPowerSettings } from "@/hooks/useBattery";
import {
  formatDrainRate,
  formatEstimatedMinutes,
  getChargingBadgeInfo,
  isHighDrainRate,
  type BatteryStatus,
} from "@/types/battery";
import { BatterySparkline } from "./BatterySparkline";
import { cn } from "@/utils/cn";

export interface BatteryWidgetProps {
  statusOverride?: BatteryStatus;
  className?: string;
  onOpenSettings?: () => void;
}

export const BatteryWidget: FC<BatteryWidgetProps> = ({
  statusOverride,
  className,
  onOpenSettings,
}) => {
  const { battery: polledBattery, isLoading, refresh } = useBattery();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Status can be overridden via prop (useful for tests and storybooks)
  const status = statusOverride ?? polledBattery;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleOpenPower = async () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      await openPowerSettings();
    }
  };

  // 1. Desktop Mode (No Battery Detected)
  if (status && !status.has_battery) {
    if (isDismissed) {
      return (
        <Card
          variant="acrylic"
          className={cn(
            "w-[360px] h-[384px] p-5 flex flex-col items-center justify-center text-center select-none text-[var(--fluent-text-secondary)]",
            className
          )}
          data-testid="battery-widget-dismissed"
        >
          <Monitor className="w-10 h-10 mb-2 opacity-40 text-sky-400" />
          <p className="text-xs mb-3">Batterie-Widget ausgeblendet.</p>
          <button
            type="button"
            onClick={() => setIsDismissed(false)}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] border border-[var(--fluent-stroke)] transition-colors text-[var(--fluent-text-primary)]"
          >
            Hinweis wieder anzeigen
          </button>
        </Card>
      );
    }

    return (
      <Card
        variant="acrylic"
        className={cn(
          "w-[360px] h-[384px] p-5 flex flex-col justify-between select-none relative overflow-hidden",
          className
        )}
        data-testid="battery-widget-no-battery"
      >
        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="absolute top-3 right-3 p-1 rounded-lg text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)] transition-colors"
          aria-label="Hinweis schließen"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="flex flex-col items-center justify-center text-center mt-6 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shadow-inner">
            <Monitor className="w-7 h-7" />
          </div>

          <div className="space-y-1.5 max-w-[280px]">
            <h3 className="text-sm font-semibold text-[var(--fluent-text-primary)]">
              Desktop-System
            </h3>
            <p className="text-xs text-[var(--fluent-text-secondary)] leading-relaxed">
              Keine Batterie erkannt — Dieses Widget ist für Laptops mit Akku optimiert.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 mt-auto">
          <button
            type="button"
            onClick={handleOpenPower}
            className="w-full py-2 px-3 rounded-xl bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] active:scale-[0.99] border border-[var(--fluent-stroke)] text-xs font-medium text-[var(--fluent-text-primary)] flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>Energieeinstellungen</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="w-full py-1.5 text-[11px] text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-secondary)] transition-colors text-center"
          >
            Hinweis ausblenden
          </button>
        </div>
      </Card>
    );
  }

  // 2. Loading State (if no status available yet)
  if (!status || (isLoading && !statusOverride)) {
    return (
      <Card
        variant="acrylic"
        className={cn(
          "w-[360px] h-[384px] p-5 flex flex-col items-center justify-center text-center select-none",
          className
        )}
        data-testid="battery-widget-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-[var(--fluent-accent)] mb-2" />
        <span className="text-xs text-[var(--fluent-text-secondary)]">
          Lade Batteriestatus...
        </span>
      </Card>
    );
  }

  const {
    charge_percent,
    is_charging,
    is_plugged_in,
    drain_rate_percent_per_min,
    estimated_mins_to_10_percent,
    estimated_mins_to_20_percent,
    estimated_mins_to_empty,
    capacity_history,
    top_process_name,
  } = status;

  const badgeInfo = getChargingBadgeInfo(charge_percent, is_charging, is_plugged_in);
  const isHighDrain = isHighDrainRate(drain_rate_percent_per_min);
  const formattedDrainRate = formatDrainRate(drain_rate_percent_per_min, is_charging);

  // Pick battery icon according to level & charging state
  const BatteryIcon = useMemo(() => {
    if (is_charging) return BatteryCharging;
    if (charge_percent > 85) return BatteryFull;
    if (charge_percent > 25) return Battery;
    if (charge_percent > 10) return BatteryLow;
    return BatteryWarning;
  }, [charge_percent, is_charging]);

  // Color progress bar depending on percentage
  const progressVariant: "error" | "warning" | "accent" =
    charge_percent <= 15 ? "error" : charge_percent <= 25 ? "warning" : "accent";

  return (
    <Card
      variant="acrylic"
      className={cn(
        "w-[360px] h-[384px] p-4 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
        className
      )}
      data-testid="battery-widget"
    >
      {/* Top Header / Hero Section */}
      <div className="space-y-2.5">
        <div className="flex items-start justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-extrabold tracking-tight"
              data-testid="battery-percentage"
            >
              {charge_percent}%
            </span>
            <Badge
              variant={badgeInfo.variant}
              size="sm"
              className="capitalize font-semibold tracking-wide"
              data-testid="battery-charging-badge"
            >
              {badgeInfo.label}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1 rounded-lg text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)] transition-colors"
              title="Aktualisieren"
              aria-label="Batteriestatus aktualisieren"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin text-sky-400")}
              />
            </button>
            <BatteryIcon
              className={cn(
                "w-5 h-5",
                is_charging
                  ? "text-emerald-400"
                  : charge_percent <= 15
                  ? "text-[var(--fluent-error)]"
                  : charge_percent <= 25
                  ? "text-[var(--fluent-warning)]"
                  : "text-sky-400"
              )}
            />
          </div>
        </div>

        {/* Level Progress Bar */}
        <ProgressBar
          value={charge_percent}
          variant={progressVariant}
          size="sm"
          className="h-1.5 rounded-full bg-white/10"
        />

        {/* Live Drain Rate */}
        <div
          className="flex items-center justify-between text-[11px] text-[var(--fluent-text-secondary)] px-0.5"
          data-testid="battery-drain-rate"
        >
          <span className="flex items-center gap-1 font-medium">
            {is_charging ? (
              <Zap className="w-3 h-3 text-emerald-400" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            )}
            {formattedDrainRate}
          </span>
          <span className="text-[10px] text-[var(--fluent-text-tertiary)]">
            {is_plugged_in ? "Netzbetrieb" : "Akkubetrieb"}
          </span>
        </div>
      </div>

      {/* Laufzeit-Prognosen Card (subtle glass background, no borders) */}
      <div
        className="bg-white/[0.04] dark:bg-white/[0.04] rounded-xl p-2.5 flex flex-col gap-1.5 border-0 shadow-none"
        data-testid="battery-projections-card"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fluent-text-tertiary)] px-0.5">
          Laufzeit-Prognosen
        </div>

        <div className="grid grid-cols-1 gap-1 text-xs">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[var(--fluent-text-secondary)]">Bis 20%:</span>
            <span className="font-semibold" data-testid="projection-20">
              {is_charging
                ? "Wird geladen"
                : formatEstimatedMinutes(estimated_mins_to_20_percent)}
            </span>
          </div>

          <div className="flex items-center justify-between px-0.5">
            <span className="text-[var(--fluent-text-secondary)]">Bis 10%:</span>
            <span className="font-semibold" data-testid="projection-10">
              {is_charging
                ? "Wird geladen"
                : formatEstimatedMinutes(estimated_mins_to_10_percent)}
            </span>
          </div>

          <div className="flex items-center justify-between px-0.5">
            <span className="text-[var(--fluent-text-secondary)]">Bis leer:</span>
            <span className="font-semibold text-sky-400" data-testid="projection-empty">
              {is_charging
                ? "Netzbetrieb"
                : formatEstimatedMinutes(estimated_mins_to_empty)}
            </span>
          </div>
        </div>
      </div>

      {/* Kapazitätsverlauf Sparkline */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--fluent-text-tertiary)] px-0.5">
          <span>Kapazitätsverlauf</span>
          <span>{capacity_history.length} Messpunkte</span>
        </div>
        <BatterySparkline
          data={capacity_history}
          height={32}
          isCharging={is_charging}
        />
      </div>

      {/* Hochverbrauch-Warnung (amber/red banner if drain rate < -1.5 %/min) */}
      {isHighDrain && (
        <div
          className="px-2.5 py-1.5 rounded-lg bg-[var(--fluent-warning)]/15 border border-[var(--fluent-warning)]/30 text-[var(--fluent-warning)] text-xs flex items-center gap-2 animate-fadeIn"
          data-testid="battery-high-drain-alert"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--fluent-warning)]" />
          <span className="text-[11px] font-medium truncate">
            {top_process_name
              ? `Hoher Verbrauch! Verursacher: ${top_process_name}`
              : "Hoher Verbrauch! Entladerate über 1.5 %/min"}
          </span>
        </div>
      )}

      {/* Quick-Action Footer */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={handleOpenPower}
          className="w-full py-2 px-3 rounded-xl bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] active:scale-[0.99] border border-[var(--fluent-stroke)] text-xs font-medium text-[var(--fluent-text-primary)] flex items-center justify-center gap-2 transition-all shadow-sm"
          data-testid="open-power-settings-btn"
        >
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>Energieeinstellungen</span>
        </button>
      </div>
    </Card>
  );
};
