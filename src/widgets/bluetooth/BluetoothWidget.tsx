import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import {
  Bluetooth,
  Headphones,
  Keyboard,
  Mouse,
  Smartphone,
  Battery,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { BluetoothDeviceInfo } from "@/types/bluetooth";
import { cn } from "@/utils/cn";

export interface BluetoothWidgetProps {
  className?: string;
  initialDevices?: BluetoothDeviceInfo[];
  autoFetch?: boolean;
}

export function getDeviceIcon(device: BluetoothDeviceInfo) {
  const type = (device.device_type ?? "").toLowerCase();
  const name = (device.name ?? "").toLowerCase();

  if (
    type === "audio" ||
    name.includes("headphone") ||
    name.includes("headset") ||
    name.includes("buds") ||
    name.includes("airpods") ||
    name.includes("earphone") ||
    name.includes("speaker") ||
    name.includes("sound") ||
    name.includes("kopfhörer")
  ) {
    return Headphones;
  }

  if (
    type === "mouse" ||
    name.includes("mouse") ||
    name.includes("maus") ||
    name.includes("trackpad") ||
    name.includes("touchpad")
  ) {
    return Mouse;
  }

  if (
    type === "keyboard" ||
    type === "input" ||
    name.includes("keyboard") ||
    name.includes("tastatur") ||
    name.includes("keychron") ||
    name.includes("mx keys")
  ) {
    return Keyboard;
  }

  if (
    type === "phone" ||
    name.includes("phone") ||
    name.includes("iphone") ||
    name.includes("pixel") ||
    name.includes("galaxy") ||
    name.includes("android") ||
    name.includes("smartphone")
  ) {
    return Smartphone;
  }

  return Bluetooth;
}

export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
  className,
  initialDevices,
  autoFetch = true,
}) => {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>(initialDevices ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const list = await invoke<BluetoothDeviceInfo[]>("get_bluetooth_devices");
      if (isMountedRef.current) {
        setDevices(list || []);
      }
    } catch (err) {
      console.error("Failed to load bluetooth devices:", err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleToggleDevice = useCallback(async (device: BluetoothDeviceInfo) => {
    setTogglingId(device.id);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const targetState = !device.connected;
      const result = await invoke<boolean>("toggle_bluetooth_device", {
        deviceId: device.id,
        connect: targetState,
      });
      if (isMountedRef.current) {
        setDevices((prev) =>
          prev.map((d) => (d.id === device.id ? { ...d, connected: result } : d))
        );
      }
    } catch (err) {
      console.error("Failed to toggle bluetooth device:", err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMountedRef.current) {
        setTogglingId(null);
      }
    }
  }, []);

  const handleOpenSettings = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_bluetooth_settings");
    } catch (err) {
      console.error("Failed to open bluetooth settings:", err);
    }
  }, []);

  useEffect(() => {
    if (initialDevices !== undefined) {
      setDevices(initialDevices);
    } else if (autoFetch) {
      void fetchDevices();
    }
  }, [initialDevices, autoFetch, fetchDevices]);

  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      if (a.connected !== b.connected) {
        return a.connected ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [devices]);

  const hasConnected = devices.some((d) => d.connected);
  const statusText = hasConnected ? "Verbunden" : devices.length > 0 ? "Bereit" : "Keine Geräte";

  return (
    <Card
      variant="acrylic"
      padded={false}
      className={cn(
        "w-full h-full p-2.5 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
        className
      )}
      data-testid="bluetooth-widget"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--fluent-stroke)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">
            <Bluetooth className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-[var(--fluent-text-primary)] truncate">
                Bluetooth
              </h2>
              <span
                data-testid="bluetooth-status"
                className={cn(
                  "text-[10px] px-1.5 py-0.2 rounded-full font-medium flex-shrink-0",
                  hasConnected
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-neutral-500/15 text-[var(--fluent-text-secondary)] border border-[var(--fluent-stroke)]"
                )}
              >
                {statusText}
              </span>
            </div>
            <p className="text-[10px] text-[var(--fluent-text-secondary)]">
              {devices.length === 1
                ? "1 Gerät gekoppelt"
                : `${devices.length} Geräte gekoppelt`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchDevices()}
          disabled={isLoading}
          data-testid="refresh-btn"
          title="Geräte aktualisieren"
          className="p-1.5 rounded-lg border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </button>
      </header>

      {/* Body: Error, Device List or Empty State */}
      <div className="flex-1 overflow-y-auto space-y-1.5 my-1.5 pr-0.5 custom-scrollbar min-h-0">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center p-3 text-center gap-1 text-[var(--fluent-error)]">
            <AlertCircle className="w-5 h-5 opacity-80" />
            <p className="text-xs font-medium">Fehler beim Laden</p>
            <p className="text-[10px] text-[var(--fluent-text-secondary)] line-clamp-2">
              {error}
            </p>
          </div>
        ) : sortedDevices.length === 0 ? (
          <div
            data-testid="empty-state"
            className="h-full flex flex-col items-center justify-center p-3 text-center gap-1.5"
          >
            <div className="p-2.5 rounded-full bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-tertiary)]">
              <Bluetooth className="w-5 h-5 opacity-60" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--fluent-text-primary)]">
                Keine Geräte gefunden
              </p>
              <p className="text-[10px] text-[var(--fluent-text-secondary)] max-w-[220px] mx-auto mt-0.5">
                Keine gekoppelten Geräte vorhanden. Überprüfe, ob Bluetooth auf deinem PC aktiv ist.
              </p>
            </div>
          </div>
        ) : (
          sortedDevices.map((device) => {
            const DeviceIcon = getDeviceIcon(device);
            const isToggling = togglingId === device.id;
            return (
              <div
                key={device.id}
                data-testid={`device-item-${device.id}`}
                className="group relative flex items-center justify-between p-2 rounded-lg bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] border border-[var(--fluent-stroke)] transition-colors gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={cn(
                      "p-1.5 rounded-md flex-shrink-0",
                      device.connected
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-[var(--fluent-subtle-bg)] text-[var(--fluent-text-secondary)]"
                    )}
                  >
                    <DeviceIcon className="w-4 h-4" data-testid="device-icon" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-xs font-medium text-[var(--fluent-text-primary)] truncate"
                      title={device.name}
                    >
                      {device.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {device.connected ? (
                        <>
                          <span
                            data-testid="connection-dot"
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] flex-shrink-0"
                          />
                          <span className="text-[10px] font-medium text-emerald-400">
                            Verbunden
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-[var(--fluent-text-secondary)]">
                          Gekoppelt
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Battery and Quick-Toggle container */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {device.battery_level != null && (
                    <div
                      data-testid={`device-battery-${device.id}`}
                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--fluent-text-secondary)] px-1.5 py-0.5 rounded bg-[var(--fluent-subtle-bg)] border border-[var(--fluent-stroke)] flex-shrink-0 group-hover:hidden"
                    >
                      <Battery className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{device.battery_level}%</span>
                    </div>
                  )}

                  {/* Quick-action Hover Button: Trennen / Verbinden */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleToggleDevice(device);
                    }}
                    disabled={isToggling}
                    data-testid={`device-toggle-btn-${device.id}`}
                    title={device.connected ? "Trennen" : "Verbinden"}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-[color,background-color,border-color] duration-150 cursor-pointer flex items-center justify-center border",
                      device.connected
                        ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40"
                        : "bg-[var(--fluent-accent-subtle)] text-[var(--fluent-accent)] border-[var(--fluent-accent)]/30 hover:bg-[var(--fluent-accent)]/20 hover:border-[var(--fluent-accent)]",
                      "hidden group-hover:flex focus:flex",
                      isToggling && "opacity-60 pointer-events-none"
                    )}
                  >
                    {isToggling ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    ) : device.connected ? (
                      "Trennen"
                    ) : (
                      "Verbinden"
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick-action Button */}
      <div className="pt-1 px-1">
        <button
          type="button"
          onClick={handleOpenSettings}
          data-testid="open-settings-btn"
          className="w-full py-1.5 px-3 rounded-lg bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] border border-[var(--fluent-stroke)] text-xs font-medium text-[var(--fluent-text-primary)] flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--fluent-accent)] flex-shrink-0 cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
          <span className="truncate">Bluetooth-Einstellungen</span>
        </button>
      </div>
    </Card>
  );
};
