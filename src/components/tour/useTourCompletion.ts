import { useCallback } from "react";
import { authApi } from "@/lib/api";
import { isAutomatedBrowser, type TourKey } from "@/lib/tours";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Whether a tour should start on its own, and how to mark it seen.
 *
 * `tours_completed` is absent when the user does not come from a real account
 * (a platform admin impersonating a shop): nothing starts by itself then.
 */
export function useTourCompletion(tour: TourKey) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const seen = currentUser?.tours_completed;
  const shouldAutoStart = !!seen && !seen.includes(tour) && !isAutomatedBrowser();
  const isDone = !!seen?.includes(tour);

  const markDone = useCallback(() => {
    const { currentUser: user, setUser } = useAuthStore.getState();
    // Locally first: the tour must not come back while the request is in
    // flight, nor on the next page if the network is down.
    if (user?.tours_completed && !user.tours_completed.includes(tour)) {
      setUser({ ...user, tours_completed: [...user.tours_completed, tour] });
    }
    authApi.completeTour(tour).catch(() => {
      // Offline or the session just ended: it starts again next time, which is
      // a nuisance, not a loss. Nothing to tell the person.
    });
  }, [tour]);

  return { shouldAutoStart, isDone, markDone };
}
