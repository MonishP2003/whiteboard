import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PRO_MONTHLY, type CreateOrderResponse } from "@whiteboard/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { isPro, useAuthStore } from "@/store/authStore";
import { openCheckout } from "./checkout";
import { formatPrice } from "./format";
import { usePaywallStore } from "./paywallStore";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

const FEATURES = [
  "Generate flowcharts and diagrams from a sentence",
  "Generate bar, line and pie charts",
  `${PRO_MONTHLY.days} days of access; renewing adds another ${PRO_MONTHLY.days}`,
];

/**
 * idle: the pitch · starting: creating the order · checkout: Razorpay's modal is open ·
 * confirming: waiting for the webhook to land · timeout: paid, but not confirmed yet.
 */
type Phase = "idle" | "starting" | "checkout" | "confirming" | "timeout";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Re-reads /me; true once the subscription is active. */
async function checkPro(): Promise<boolean> {
  try {
    await useAuthStore.getState().refresh();
  } catch {
    return false;
  }
  return isPro(useAuthStore.getState().subscription);
}

function orderErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : null;
  if (code === "PAYMENTS_NOT_CONFIGURED") return "Payments aren't set up on this server.";
  if (code === "UNAUTHORIZED") return "Your session has expired. Log in again.";
  return "Couldn't start the payment. Try again.";
}

/** The upgrade flow. Access is granted by the server's webhook, never by this dialog. */
export function PaywallDialog() {
  const open = usePaywallStore((s) => s.open);
  const closePaywall = usePaywallStore((s) => s.closePaywall);
  const user = useAuthStore((s) => s.user);
  const [phase, setPhase] = useState<Phase>("idle");
  const pollRef = useRef<AbortController | null>(null);

  // Stop polling if the dialog goes away.
  useEffect(() => () => pollRef.current?.abort(), []);

  const finish = () => {
    const { onActivated } = usePaywallStore.getState();
    pollRef.current?.abort();
    setPhase("idle");
    closePaywall();
    toast.success("You're on Pro. Enjoy!");
    onActivated?.();
  };

  const close = () => {
    pollRef.current?.abort();
    setPhase("idle");
    closePaywall();
  };

  async function waitForWebhook() {
    const poll = new AbortController();
    pollRef.current = poll;
    setPhase("confirming");
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS, poll.signal);
      if (poll.signal.aborted) return;
      if (await checkPro()) {
        if (!poll.signal.aborted) finish();
        return;
      }
    }
    if (!poll.signal.aborted) setPhase("timeout");
  }

  async function upgrade() {
    setPhase("starting");
    let order: CreateOrderResponse;
    try {
      order = await api<CreateOrderResponse>("/payments/order", { method: "POST" });
    } catch (err) {
      console.error(err);
      toast.error(orderErrorMessage(err));
      setPhase("idle");
      return;
    }
    setPhase("checkout");
    let result: "paid" | "dismissed";
    try {
      result = await openCheckout(order, { email: user?.email, name: user?.name });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't open the payment window. Check your connection and try again.");
      setPhase("idle");
      return;
    }
    if (result === "dismissed") setPhase("idle");
    else await waitForWebhook();
  }

  async function recheck() {
    setPhase("confirming");
    if (await checkPro()) finish();
    else setPhase("timeout");
  }

  const busy = phase === "starting" || phase === "confirming";

  return (
    <Dialog
      // Hidden, not closed, while Razorpay's own modal is up: a Radix modal would block it.
      open={open && phase !== "checkout"}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className="max-w-md"
        // Returning focus to the prompt bar would reopen the paywall.
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        {phase === "confirming" ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirming payment…</DialogTitle>
              <DialogDescription>This usually takes a few seconds.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : phase === "timeout" ? (
          <>
            <DialogHeader>
              <DialogTitle>Payment received</DialogTitle>
              <DialogDescription>
                Your access will activate shortly. You can close this and keep working.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              <Button onClick={recheck}>Refresh</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-amber-500" /> Upgrade to Pro
              </DialogTitle>
              <DialogDescription>AI generation is a Pro feature.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-2xl font-semibold">
              {formatPrice(PRO_MONTHLY.amountPaise, PRO_MONTHLY.currency)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {PRO_MONTHLY.days} days
              </span>
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Not now
              </Button>
              <Button onClick={upgrade} disabled={phase === "starting"}>
                {phase === "starting" && <Loader2 className="animate-spin" />}
                Upgrade
              </Button>
            </DialogFooter>
            <p className="text-center text-xs text-muted-foreground">
              Test mode: no real money is charged.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
