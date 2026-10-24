import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { bytesToGb, formatBytesGb, getMetricVariant } from "@/types/resources";
import { MiniGraph } from "@/widgets/resources/MiniGraph";
import { MetricBar } from "@/widgets/resources/MetricBar";
import { ResourceWidget } from "@/widgets/resources/ResourceWidget";
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
  it("renders SVG sparkline with correct coordinates", () => {
    const { container } = render(
      <MiniGraph data={[10, 20, 30, 40]} height={32} variant="accent" />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();

    const path = container.querySelector("path[stroke]");
    expect(path).toBeDefined();
    expect(path?.getAttribute("d")).toContain("M 0.0");
    expect(path?.getAttribute("d")).toContain("L 100.0");
  });

  it("handles empty data gracefully without throwing", () => {
    const { container } = render(<MiniGraph data={[]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
  });
});

describe("MetricBar component", () => {
  it("renders metric label, value and badge percentage", () => {
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
  it("renders CPU, Memory and Disk information", () => {
    render(<ResourceWidget />);

    expect(screen.getByText("System Resources")).toBeDefined();
    expect(screen.getByText("CPU")).toBeDefined();
    expect(screen.getByText("Memory")).toBeDefined();
    expect(screen.getByText(/Storage/)).toBeDefined();

    // CPU core count
    expect(screen.getByText(`(${MOCK_SYSTEM_METRICS.cpu_cores} Cores)`)).toBeDefined();
  });

  it("triggers lock toggle when lock button clicked", () => {
    const onToggleLock = vi.fn();
    render(<ResourceWidget onToggleLock={onToggleLock} isLocked={false} />);

    const lockBtn = screen.getByRole("button", { name: /Lock System Resources position/i });
    fireEvent.click(lockBtn);
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  it("defaults active disk display to system drive C: even when multiple drives present", () => {
    render(<ResourceWidget />);
    // MOCK_SYSTEM_METRICS has drive C:
    expect(screen.getByText("Storage (C:)")).toBeDefined();
  });
});
