import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { bytesToGb, formatBytesGb, formatNetworkSpeed, getMetricVariant } from "@/types/resources";
import { MiniGraph } from "@/widgets/resources/MiniGraph";
import { MetricBar } from "@/widgets/resources/MetricBar";
import { ResourceWidget } from "@/widgets/resources/ResourceWidget";
import { WidgetContainer } from "@/components/layout";
import { MOCK_SYSTEM_METRICS } from "@/hooks/useSystemMetrics";

describe("Resource utility functions", () => {
  it("converts bytes to gigabytes correctly", () => {
    // 16 GiB
    const bytes16Gb = 16 * 1024 * 1024 * 1024;
    expect(bytesToGb(bytes16Gb)).toBe(16.0);

    // 8.5 GiB
    const bytes8_5Gb = 8.5 * 1024 * 1024 * 1024;
    expect(bytesToGb(bytes8_5Gb)).toBe(8.5);

    // 0 or negative
    expect(bytesToGb(0)).toBe(0);
    expect(bytesToGb(-100)).toBe(0);
  });

  it("formats bytes into readable string", () => {
    const bytes = 16 * 1024 * 1024 * 1024;
    expect(formatBytesGb(bytes)).toBe("16.0 GB");

    const bytesFraction = 8.24 * 1024 * 1024 * 1024;
    expect(formatBytesGb(bytesFraction, 1)).toBe("8.2 GB");
  });

  it("formats network transfer rate into KB/s and MB/s", () => {
    expect(formatNetworkSpeed(0)).toBe("0 KB/s");
    expect(formatNetworkSpeed(-100)).toBe("0 KB/s");

    // 500 KB/s
    expect(formatNetworkSpeed(500 * 1024)).toBe("500 KB/s");

    // 2.4 MB/s
    expect(formatNetworkSpeed(2.4 * 1024 * 1024)).toBe("2.4 MB/s");

    // 120 MB/s
    expect(formatNetworkSpeed(120 * 1024 * 1024)).toBe("120 MB/s");
  });

  it("evaluates metric variants based on danger/warning thresholds", () => {
    expect(getMetricVariant(40)).toBe("accent");
    expect(getMetricVariant(79)).toBe("accent");
    expect(getMetricVariant(80)).toBe("warning");
    expect(getMetricVariant(89)).toBe("warning");
    expect(getMetricVariant(90)).toBe("error");
    expect(getMetricVariant(99)).toBe("error");
  });
});

describe("MiniGraph component", () => {
  it("renders SVG sparkline with correct coordinates and 1.5 stroke width", () => {
    const { container } = render(
      <MiniGraph data={[10, 20, 30, 40]} height={28} variant="accent" />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();

    const path = container.querySelector("path[stroke]");
    expect(path).toBeDefined();
    expect(path?.getAttribute("d")).toContain("M 0.0");
    expect(path?.getAttribute("d")).toContain("L 100.0");
    expect(path?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("handles empty data gracefully without throwing", () => {
    const { container } = render(<MiniGraph data={[]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
  });
});

describe("MetricBar component", () => {
  it("renders metric label, value and percentage text", () => {
    render(
      <MetricBar
        label="Memory"
        valueDisplay="8.0 / 16.0 GB"
        percent={50}
      />
    );

    expect(screen.getByText("Memory")).toBeDefined();
    expect(screen.getByText("8.0 / 16.0 GB")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();

    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
  });

  it("clamps out-of-range percentage values", () => {
    render(
      <MetricBar
        label="Overloaded"
        valueDisplay="120%"
        percent={120}
      />
    );

    expect(screen.getByText("100%")).toBeDefined();
  });
});

describe("ResourceWidget component", () => {
  it("renders CPU, Memory, Disk and Network information", () => {
    render(<ResourceWidget />);

    expect(screen.getByText("CPU")).toBeDefined();
    expect(screen.getByText("Arbeitsspeicher")).toBeDefined();
    expect(screen.getByText(/Systemlaufwerk/)).toBeDefined();
    expect(screen.getByText("Netzwerk")).toBeDefined();

    // CPU core count
    expect(screen.getByText(`${MOCK_SYSTEM_METRICS.cpu_cores} Cores`)).toBeDefined();

    // Network throughput rows
    expect(screen.getByText(/Download/i)).toBeDefined();
    expect(screen.getByText(/Upload/i)).toBeDefined();
    expect(screen.getByText("2.4 MB/s")).toBeDefined();
    expect(screen.getByText("420 KB/s")).toBeDefined();
  });

  it("renders top process badge below sparkline when available", () => {
    render(<ResourceWidget />);

    expect(screen.getByText(/Top: chrome\.exe/i)).toBeDefined();
    expect(screen.getByText(/\(14%\)/i)).toBeDefined();
  });

  it("allows switching active disk using segmented pill switcher", () => {
    render(<ResourceWidget />);

    // Defaults to C:
    expect(screen.getByText("Systemlaufwerk (C:)")).toBeDefined();

    // Click D: disk switcher pill
    const diskBtnD = screen.getByRole("button", { name: "D:" });
    fireEvent.click(diskBtnD);

    // Active disk switched to D:
    expect(screen.getByText("Systemlaufwerk (D:)")).toBeDefined();

    // Click back to C:
    const diskBtnC = screen.getByRole("button", { name: "C:" });
    fireEvent.click(diskBtnC);
    expect(screen.getByText("Systemlaufwerk (C:)")).toBeDefined();
  });

  it("renders within WidgetContainer with lock toggle in independent mode", () => {
    const onToggleLock = vi.fn();
    render(
      <WidgetContainer
        id="resources"
        title="System Resources"
        isLocked={false}
        onToggleLock={onToggleLock}
      >
        <ResourceWidget />
      </WidgetContainer>
    );

    expect(screen.getByText("System Resources")).toBeDefined();
    const lockBtn = screen.getByRole("button", { name: /Lock System Resources position/i });
    fireEvent.click(lockBtn);
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });
});
