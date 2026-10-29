import { invoke } from "@tauri-apps/api/core";

/**
 * Detects whether the code is currently executing inside a Tauri webview.
 */
export const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

/**
 * Centrally managed safe invoke wrapper.
 * Statically imports `invoke` to eliminate dynamic module imports across hooks.
 * Gracefully rejects if not executing within the Tauri desktop runtime.
 */
export async function safeInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (isTauri()) {
    return invoke<T>(cmd, args);
  }
  return Promise.reject(new Error(`Tauri core IPC not available for ${cmd}`));
}
