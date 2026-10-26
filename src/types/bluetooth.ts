export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  paired: boolean;
  battery_level?: number | null;
  device_type: "audio" | "input" | "phone" | "other" | string;
}
