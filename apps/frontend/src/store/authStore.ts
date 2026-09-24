import { create } from "zustand";
import type { LoginBody, MeResponse, RegisterBody } from "@whiteboard/shared";
import { api, ApiError } from "@/lib/api";

type AuthStatus = "unknown" | "loading" | "authenticated" | "anonymous" | "error";

interface AuthState {
  status: AuthStatus;
  user: Omit<MeResponse, "subscription"> | null;
  subscription: MeResponse["subscription"];
  /** Loads the current user from the cookie session. A 401 means "logged out", not an error. */
  fetchMe: () => Promise<void>;
  /** Re-reads /me without passing through "loading", so the page stays mounted. */
  refresh: () => Promise<void>;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
}

const signedOut = { status: "anonymous", user: null, subscription: null } as const;

function signedIn({ subscription, ...user }: MeResponse) {
  return { status: "authenticated" as const, user, subscription };
}

/** Mirrors the server: access needs ACTIVE and an expiry still ahead. */
export function isPro(subscription: MeResponse["subscription"], now = Date.now()): boolean {
  return subscription?.status === "ACTIVE" && Date.parse(subscription.expiresAt) > now;
}

export const useIsPro = () => useAuthStore((s) => isPro(s.subscription));

export const useAuthStore = create<AuthState>()((set) => ({
  status: "unknown",
  user: null,
  subscription: null,

  async fetchMe() {
    set({ status: "loading" });
    try {
      set(signedIn(await api<MeResponse>("/me")));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) set(signedOut);
      else {
        set({ status: "error" });
        throw err;
      }
    }
  },

  async refresh() {
    set(signedIn(await api<MeResponse>("/me")));
  },

  async login(body) {
    set(
      signedIn(
        await api<MeResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
      ),
    );
  },

  async register(body) {
    set(
      signedIn(
        await api<MeResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
      ),
    );
  },

  async logout() {
    await api("/auth/logout", { method: "POST" });
    set(signedOut);
  },
}));
