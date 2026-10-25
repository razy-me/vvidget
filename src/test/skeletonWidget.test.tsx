import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkeletonWidget } from "@/components/layout/SkeletonWidget";

describe("SkeletonWidget Component", () => {
  it("renders the skeleton card with correct test id and accessibility elements", () => {
    render(<SkeletonWidget title="Media Controls" />);

    const root = screen.getByTestId("skeleton-widget");
    expect(root).toBeInTheDocument();
    expect(root).toHaveClass("pointer-events-none");

    const dropTarget = screen.getByText("Drop Target");
    expect(dropTarget).toBeInTheDocument();

    const titleEl = screen.getByText("Media Controls");
    expect(titleEl).toBeInTheDocument();
  });

  it("applies customized className when provided", () => {
    render(<SkeletonWidget className="custom-test-class" />);

    const root = screen.getByTestId("skeleton-widget");
    expect(root).toHaveClass("custom-test-class");
  });
});
