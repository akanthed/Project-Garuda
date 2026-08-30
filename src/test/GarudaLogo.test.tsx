import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GarudaLogo } from "@/components/GarudaLogo";

describe("GarudaLogo", () => {
  it("renders Golden Wings everywhere", () => {
    render(
      <>
        <GarudaLogo className="logo-one" />
        <GarudaLogo className="logo-two" />
      </>
    );

    expect(screen.getAllByTestId("garuda-logo")).toHaveLength(2);
    screen.getAllByTestId("garuda-logo").forEach((logo) => {
      expect(logo).toHaveAttribute("data-logo-variant", "wing");
      expect(logo.getAttribute("src")).toMatch(/\/favicon\.svg\?v=golden-wings$/);
    });
  });
});