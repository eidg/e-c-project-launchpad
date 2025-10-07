import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AuthProvider } from "../contexts/AuthProvider";
import Login from "../components/Login";
import Signup from "../components/Signup";
import Dashboard from "../components/Dashboard";
import ProtectedRoute from "../components/ProtectedRoute";

// Mock fetch for testing
global.fetch = jest.fn();

const MockAuthProvider = ({
  children,
  mockUser = null,
  mockLoading = false,
}) => {
  const mockValue = {
    user: mockUser,
    loading: mockLoading,
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
    checkAuth: jest.fn(),
  };

  return <AuthProvider value={mockValue}>{children}</AuthProvider>;
};

describe("Authentication Components", () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe("Login Component", () => {
    it("renders login form", () => {
      const mockToggle = jest.fn();
      render(
        <MockAuthProvider>
          <Login onToggleMode={mockToggle} />
        </MockAuthProvider>,
      );

      expect(screen.getByText("Login")).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /login/i }),
      ).toBeInTheDocument();
    });

    it("shows signup link", () => {
      const mockToggle = jest.fn();
      render(
        <MockAuthProvider>
          <Login onToggleMode={mockToggle} />
        </MockAuthProvider>,
      );

      const signupLink = screen.getByText(/sign up/i);
      expect(signupLink).toBeInTheDocument();

      fireEvent.click(signupLink);
      expect(mockToggle).toHaveBeenCalled();
    });

    it("validates form inputs", () => {
      const mockToggle = jest.fn();
      render(
        <MockAuthProvider>
          <Login onToggleMode={mockToggle} />
        </MockAuthProvider>,
      );

      const submitButton = screen.getByRole("button", { name: /login/i });
      fireEvent.click(submitButton);

      // Form should require email and password
      expect(screen.getByLabelText(/email/i)).toBeRequired();
      expect(screen.getByLabelText(/password/i)).toBeRequired();
    });
  });

  describe("Signup Component", () => {
    it("renders signup form", () => {
      const mockToggle = jest.fn();
      render(
        <MockAuthProvider>
          <Signup onToggleMode={mockToggle} />
        </MockAuthProvider>,
      );

      expect(screen.getByText("Sign Up")).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign up/i }),
      ).toBeInTheDocument();
    });

    it("validates password confirmation", async () => {
      const mockToggle = jest.fn();
      render(
        <MockAuthProvider>
          <Signup onToggleMode={mockToggle} />
        </MockAuthProvider>,
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", { name: /sign up/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.change(confirmPasswordInput, {
        target: { value: "differentpassword" },
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    it("validates password length", async () => {
      const mockToggle = jest.fn();
      render(
        <MockAuthProvider>
          <Signup onToggleMode={mockToggle} />
        </MockAuthProvider>,
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole("button", { name: /sign up/i });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "123" } });
      fireEvent.change(confirmPasswordInput, { target: { value: "123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 8 characters/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Dashboard Component", () => {
    it("renders dashboard for authenticated user", () => {
      const mockUser = { email: "test@example.com", id: "123" };
      render(
        <MockAuthProvider mockUser={mockUser}>
          <Dashboard />
        </MockAuthProvider>,
      );

      expect(screen.getByText("E C Project Launchpad Dashboard")).toBeInTheDocument();
      expect(
        screen.getByText(/welcome, test@example.com/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/phase 0.2 complete/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /logout/i }),
      ).toBeInTheDocument();
    });
  });

  describe("ProtectedRoute Component", () => {
    it("shows loading state", () => {
      render(
        <MockAuthProvider mockLoading={true}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </MockAuthProvider>,
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it("shows auth required when no user", () => {
      render(
        <MockAuthProvider mockUser={null}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </MockAuthProvider>,
      );

      expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
      expect(screen.getByText(/please log in/i)).toBeInTheDocument();
    });

    it("renders children when user is authenticated", () => {
      const mockUser = { email: "test@example.com", id: "123" };
      render(
        <MockAuthProvider mockUser={mockUser}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </MockAuthProvider>,
      );

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });
});
