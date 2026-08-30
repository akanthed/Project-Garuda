import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const graphHarness = vi.hoisted(() => ({
  props: null as Record<string, any> | null,
  zoomToFit: vi.fn(),
}));

vi.mock("react-force-graph-2d", async () => {
  const ReactModule = await import("react");
  return {
    default: ReactModule.forwardRef((props: Record<string, any>, ref) => {
      graphHarness.props = props;
      ReactModule.useImperativeHandle(ref, () => ({
        zoomToFit: graphHarness.zoomToFit,
        centerAt: vi.fn(),
        zoom: vi.fn(),
        screen2GraphCoords: (x: number, y: number) => ({ x, y }),
      }));
      return ReactModule.createElement("canvas", { "data-testid": "real-graph-canvas" });
    }),
  };
});

vi.mock("@/lib/mock-api", () => ({
  fetchNetwork: vi.fn().mockResolvedValue({
    data: {
      nodes: [
        { id: "S-1", label: "Suspect Alice", type: "Suspect", weight: 5, risk: "high" },
        { id: "F-1", label: "FIR-1", type: "FIR", weight: 2, risk: "low" },
      ],
      edges: [{ source: "S-1", target: "F-1", relation: "Primary Accused" }],
    },
  }),
  fetchKingpins: vi.fn().mockResolvedValue({ data: [] }),
  fetchCommunities: vi.fn().mockResolvedValue({ data: [] }),
  fetchPredictedLinks: vi.fn().mockResolvedValue({ data: [] }),
  fetchConnectionPath: vi.fn(),
}));

import { LinkGraph } from "@/components/dashboard/LinkGraph";

describe("LinkGraph production interactions", () => {
  beforeEach(() => {
    graphHarness.props = null;
    graphHarness.zoomToFit.mockClear();
  });

  it("opens node details and keeps them selected until a background click", async () => {
    render(<LinkGraph />);
    await waitFor(() => expect(graphHarness.props?.onNodeClick).toBeTypeOf("function"));

    act(() => graphHarness.props?.onNodeClick(graphHarness.props.graphData.nodes[0]));
    expect(screen.getAllByText("Suspect Alice").length).toBeGreaterThan(0);

    act(() => graphHarness.props?.onBackgroundClick());
    expect(screen.queryByText("S-1")).not.toBeInTheDocument();
  });

  it("shows a pointer cursor while a custom-drawn node is hovered", async () => {
    render(<LinkGraph />);
    await waitFor(() => expect(graphHarness.props?.onNodeHover).toBeTypeOf("function"));
    const canvas = screen.getByTestId("real-graph-canvas");
    const container = canvas.parentElement as HTMLElement;

    act(() => graphHarness.props?.onNodeHover(graphHarness.props.graphData.nodes[0]));
    expect(container.style.cursor).toBe("pointer");

    act(() => graphHarness.props?.onNodeHover(null));
    expect(container.style.cursor).toBe("grab");
  });

  it("opens Find Connection with selectable people", async () => {
    const user = userEvent.setup();
    render(<LinkGraph />);

    await user.click(await screen.findByRole("button", { name: "Find Connection" }));

    expect(screen.getByPlaceholderText("First suspect")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Second suspect")).toBeInTheDocument();
    const suggestion = document.querySelector<HTMLDataListElement>("#connection-source-people")?.options[0];
    expect(suggestion?.value).toBe("S-1");
    expect(suggestion?.textContent).toBe("Suspect Alice");
  });

  it("provides an enlarged pointer paint area for custom node sizes", async () => {
    render(<LinkGraph />);
    await waitFor(() => expect(graphHarness.props?.nodePointerAreaPaint).toBeTypeOf("function"));
    const context = {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    graphHarness.props?.nodePointerAreaPaint(graphHarness.props.graphData.nodes[0], "#fff", context);

    expect(context.arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), 0, 2 * Math.PI);
    expect((context.arc as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBeGreaterThanOrEqual(10);
  });

  it("auto-fits once and does not fight user zoom after container resizes", async () => {
    let width = 700;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      width,
      height: 380,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 380,
      toJSON: () => ({}),
    }));
    render(<LinkGraph />);
    await waitFor(() => expect(graphHarness.zoomToFit).toHaveBeenCalledTimes(1), { timeout: 1600 });

    width = 820;
    act(() => window.dispatchEvent(new Event("resize")));
    await new Promise((resolve) => window.setTimeout(resolve, 1000));

    expect(graphHarness.zoomToFit).toHaveBeenCalledTimes(1);
    rect.mockRestore();
  });
});
