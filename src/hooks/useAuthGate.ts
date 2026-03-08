import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const VISIT_COUNT_KEY = "evecad_visit_count";

/**
 * Tracks visits and provides a gate function that redirects
 * unauthenticated users to /auth on second visit or export attempt.
 */
export function useAuthGate() {
  const { user, loading } = useAuth();
  const [isReturningUser, setIsReturningUser] = useState(false);

  useEffect(() => {
    const count = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || "0", 10);
    const newCount = count + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(newCount));
    setIsReturningUser(newCount > 1);
  }, []);

  /** Returns true if user is authenticated or this is their first visit. Returns false and shows toast if gate blocks. */
  const requireAuth = (action: string = "continue"): boolean => {
    if (user) return true;
    toast.info(`Sign in to ${action}`, {
      description: "Create a free account to unlock this feature.",
      action: {
        label: "Sign in",
        onClick: () => {
          window.location.href = "/auth";
        },
      },
    });
    return false;
  };

  return {
    user,
    loading,
    isReturningUser,
    /** Whether auth is required now (returning user and not logged in) */
    needsAuth: isReturningUser && !user,
    /** Gate a specific action — returns true if allowed */
    requireAuth,
  };
}
