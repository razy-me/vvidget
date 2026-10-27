import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpeedtestWidget } from "@/widgets/speedtest/SpeedtestWidget";
import type { UseSpeedtestReturn } from "@/types/speedtest";
import type { SpeedtestResult } from "@/types/config";

const mockIdleHook: UseSpeedtestReturn = {
  status: "idle",
  stage: "idle",
  progress: 0,
  currentMbps: 0,
  liveMetrics: {
    ping_ms: null,
    jitter_ms: null,
    download_mbps: null,
    upload_mbps: null,
  },
  lastResult: null,
  history: [],
  error: null,
  startTest: vi.fn(),
  refreshHistory: vi.fn(),
};

const mockRunningHook: UseSpeedtestReturn = {
  status: "running",
  stage: "download",
  progress: 0.65,
  currentMbps: 142.8,
  liveMetrics: {
    ping_ms: 18.4,
    jitter_ms: 1.2,
    download_mbps: 142.8,
    upload_mbps: null,
  },
  lastResult: null,
  history: [],
  error: null,
  startTest: vi.fn(),
  refreshHistory: vi.fn(),
};

const completedResult: SpeedtestResult = {
  timestamp: 1710000000,
  ping_ms: 15.2,
  jitter_ms: 1.8,
  download_mbps: 284.5,
  upload_mbps: 52.3,
};

const mockCompletedHook: UseSpeedtestReturn = {
  status: "done",
  stage: "complete",
  progress: 1.0,
  currentMbps: 284.5,
  liveMetrics: {
    ping_ms: 15.2,
    jitter_ms: 1.8,
    download_mbps: 284.5,
    upload_mbps: 52.3,
  },
  lastResult: completedResult,
  history: [
    {
      timestamp: 1709900000,
      ping_ms: 22.0,
      jitter_ms: 2.1,
      download_mbps: 210.0,
      upload_mbps: 45.0,
    },
    completedResult,
  ],
  error: null,
  startTest: vi.fn(),
  refreshHistory: vi.fn(),
};

describe("SpeedtestWidget Component", () => {
  it("renders idle state correctly with ready badge and start button", () => {
    render(<SpeedtestWidget hookOverride={mockIdleHook} />);

    expect(screen.getByText("Internet Speedtest")).toBeInTheDocument();
    expect(screen.getByTestId("speedtest-stage-badge")).toHaveTextContent("Bereit");
    expect(screen.getByTestId("speedtest-speed-value")).toHaveTextContent("--");
    expect(screen.getByTestId("speedtest-start-button")).toHaveTextContent("Test starten");
    expect(screen.getByText("Keine Daten")).toBeInTheDocument();

    const pingMetric = screen.getByTestId("metric-ping");
    expect(pingMetric).toHaveTextContent("--");
  });

  it("renders running state with active progress and live readout", () => {
    render(<SpeedtestWidget hookOverride={mockRunningHook} />);

    expect(screen.getByTestId("speedtest-stage-badge")).toHaveTextContent("Download testen...");
    expect(screen.getByTestId("speedtest-speed-value")).toHaveTextContent("142.8");

    const startBtn = screen.getByTestId("speedtest-start-button");
    expect(startBtn).toHaveTextContent("Wird getestet...");
    expect(startBtn).toBeDisabled();

    // Check live metrics
    expect(screen.getByTestId("metric-ping")).toHaveTextContent("18 ms");
    expect(screen.getByTestId("metric-ping")).toHaveTextContent("Jitter: 1.2 ms");
    expect(screen.getByTestId("metric-download")).toHaveTextContent("142.8");
  });

  it("renders completed state with final metrics and restart button", () => {
    render(<SpeedtestWidget hookOverride={mockCompletedHook} />);

    expect(screen.getByTestId("speedtest-stage-badge")).toHaveTextContent("Test abgeschlossen");
    expect(screen.getByTestId("speedtest-speed-value")).toHaveTextContent("284.5");

    const startBtn = screen.getByTestId("speedtest-start-button");
    expect(startBtn).toHaveTextContent("Erneut testen");
    expect(startBtn).not.toBeDisabled();

    expect(screen.getByTestId("metric-ping")).toHaveTextContent("15 ms");
    expect(screen.getByTestId("metric-download")).toHaveTextContent("284.5");
    expect(screen.getByTestId("metric-upload")).toHaveTextContent("52.3");

    // History sparkline bars
    expect(screen.getByTestId("history-bar-0")).toBeInTheDocument();
    expect(screen.getByTestId("history-bar-1")).toBeInTheDocument();
  });

  it("handles test initiation click event from action button and center gauge", () => {
    const startTestMock = vi.fn();
    const hookWithMock = {
      ...mockIdleHook,
      startTest: startTestMock,
    };

    render(<SpeedtestWidget hookOverride={hookWithMock} />);
    const startBtn = screen.getByTestId("speedtest-start-button");
    fireEvent.click(startBtn);

    expect(startTestMock).toHaveBeenCalledTimes(1);

    // Also verify center gauge circle button triggers startTest
    const gaugeBtn = screen.getByTestId("speedtest-gauge-button");
    expect(gaugeBtn).toBeInTheDocument();
    expect(screen.getByTestId("speedtest-gauge-hover-hint")).toBeInTheDocument();
    fireEvent.click(gaugeBtn);

    expect(startTestMock).toHaveBeenCalledTimes(2);
  });

  it("displays error message cleanly on failure", () => {
    const mockErrorHook: UseSpeedtestReturn = {
      ...mockIdleHook,
      status: "error",
      stage: "error",
      error: "DNS resolution failed",
    };

    render(<SpeedtestWidget hookOverride={mockErrorHook} />);

    expect(screen.getByTestId("speedtest-stage-badge")).toHaveTextContent("Fehler beim Test");
    expect(screen.getByText("DNS resolution failed")).toBeInTheDocument();
  });

  it("regression M6-02: displays 'Cloudflare Payload' subtitle in upload metric card without truncation", () => {
    render(<SpeedtestWidget hookOverride={mockCompletedHook} />);

    const uploadMetric = screen.getByTestId("metric-upload");
    expect(uploadMetric).toHaveTextContent("Cloudflare Payload");
    expect(uploadMetric).not.toHaveTextContent("Speed test payload");
  });

  it("regression X-fluent-ux-security-07: renders fluid w-full h-full card and properly merges custom className", () => {
    render(
      <SpeedtestWidget hookOverride={mockIdleHook} className="custom-fluid-class" />
    );
    const card = screen.getByTestId("speedtest-widget");
    expect(card.className).toContain("w-full");
    expect(card.className).toContain("h-full");
    expect(card.className).toContain("custom-fluid-class");
    expect(card.className).not.toContain("w-[360px]");
    expect(card.className).not.toContain("h-[256px]");
  });
});
