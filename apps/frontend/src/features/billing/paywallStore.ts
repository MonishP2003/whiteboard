import { create } from "zustand";

interface PaywallState {
  open: boolean;
  /** Runs once Pro is confirmed, e.g. to retry the AI request that hit the paywall. */
  onActivated: (() => void) | null;
  openPaywall: (onActivated?: () => void) => void;
  closePaywall: () => void;
}

export const usePaywallStore = create<PaywallState>()((set) => ({
  open: false,
  onActivated: null,
  openPaywall: (onActivated) => set({ open: true, onActivated: onActivated ?? null }),
  closePaywall: () => set({ open: false, onActivated: null }),
}));

export const openPaywall = (onActivated?: () => void) =>
  usePaywallStore.getState().openPaywall(onActivated);
