import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "../src/App";

// Mock the React router
vi.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Routes: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Route: () => null,
  Navigate: () => null
}));

// Create mutable mock values
let mockHealthError = false;
let mockProjectionStatus = "synced";

// Mock the entire hardkas react context hook package
vi.mock("@hardkas/react", () => {
  return {
    HardKasProvider: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    useHardKasHealth: () => ({
      isError: mockHealthError,
      error: mockHealthError ? new Error("Mocked offline error") : null,
      isLoading: false
    }),
    useHardKas: () => ({
      projectionStatus: mockProjectionStatus
    })
  };
});

describe("Dashboard App E2E/Integration", () => {
  it("renders the RuntimeOfflineCard when health check fails", () => {
    mockHealthError = true;
    mockProjectionStatus = "synced";

    render(<App />);

    expect(screen.getByText(/Runtime status/i)).toBeInTheDocument();
    expect(screen.getByText(/HardKAS Runtime Offline/i)).toBeInTheDocument();
    expect(screen.getByText(/Mocked offline error/i)).toBeInTheDocument();
  });

  it("renders the ProjectionBanner when projection is stale", () => {
    mockHealthError = false;
    mockProjectionStatus = "stale";

    render(<App />);

    expect(
      screen.getByText(/Projection updating — displayed data may be stale/i)
    ).toBeInTheDocument();
  });

  it("does not render the ProjectionBanner when projection is synced", () => {
    mockHealthError = false;
    mockProjectionStatus = "synced";

    render(<App />);

    expect(
      screen.queryByText(/Projection updating — displayed data may be stale/i)
    ).not.toBeInTheDocument();
  });
});
