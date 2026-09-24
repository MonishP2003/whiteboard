import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChartColumn, Info, Loader2, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import {
  AI_LIMITS,
  type ChartRequest,
  type ChartResponse,
  type DiagramRequest,
  type DiagramResponse,
} from "@whiteboard/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openPaywall } from "@/features/billing/paywallStore";
import { FloatingPanel } from "@/features/editor/FloatingPanel";
import { api, ApiError } from "@/lib/api";
import { preloadElk } from "@/lib/elkLayout";
import { useAuthStore, useIsPro } from "@/store/authStore";
import { insertChart } from "./insertChart";
import { insertDiagram } from "./insertDiagram";

type Mode = "diagram" | "chart";

const PLACEHOLDER: Record<Mode, string> = {
  diagram: "Describe a diagram, e.g. login flow with OAuth and 2FA",
  chart: "Describe a chart, e.g. bar chart of monthly sales Jan–Jun",
};

const PRIVACY_NOTE =
  "Prompts are sent to Google Gemini's free tier, and Google may use them to improve its " +
  "products. Don't include anything private.";

function errorMessage(err: unknown, mode: Mode): string {
  const code = err instanceof ApiError ? err.code : null;
  switch (code) {
    case "AI_QUOTA_EXCEEDED":
      return "You've reached the AI limit (5 a minute, 50 a day). Try again in a little while.";
    case "AI_RATE_LIMITED":
      return "The AI service is busy right now. Try again in a minute.";
    case "AI_INVALID_OUTPUT":
      return `The AI couldn't produce a valid ${mode}. Try rephrasing your prompt.`;
    case "AI_UPSTREAM_ERROR":
      return "The AI service didn't respond. Try again.";
    case "AI_NOT_CONFIGURED":
      return "AI generation isn't set up on this server.";
    case "VALIDATION_FAILED":
      return `Prompts must be ${AI_LIMITS.minPromptLength}–${AI_LIMITS.maxPromptLength} characters.`;
    case "UNAUTHORIZED":
      return "Your session has expired. Log in again.";
    default:
      return `Couldn't generate the ${mode}. Try again.`;
  }
}

/** Prompt → Gemini (via the api) → shapes or a chart image on the board. */
export function AiPromptBar() {
  const [mode, setMode] = useState<Mode>("diagram");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const pro = useIsPro();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the board abandons a pending request, so nothing lands on another board.
  useEffect(() => () => abortRef.current?.abort(), []);

  const trimmed = prompt.trim();
  const canSubmit = !busy && trimmed.length >= AI_LIMITS.minPromptLength;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) void generate(mode, trimmed);
  }

  async function generate(mode: Mode, trimmed: string) {
    const abort = new AbortController();
    abortRef.current = abort;
    setBusy(true);
    try {
      const init = { method: "POST", signal: abort.signal };
      if (mode === "diagram") {
        const body: DiagramRequest = { prompt: trimmed };
        const diagram = await api<DiagramResponse>("/ai/diagram", {
          ...init,
          body: JSON.stringify(body),
        });
        if (abort.signal.aborted) return;
        await insertDiagram(diagram);
      } else {
        const body: ChartRequest = { prompt: trimmed };
        const chart = await api<ChartResponse>("/ai/chart", {
          ...init,
          body: JSON.stringify(body),
        });
        if (abort.signal.aborted) return;
        await insertChart(chart);
      }
      setPrompt("");
    } catch (err) {
      if (abort.signal.aborted) return;
      if (err instanceof ApiError && err.status === 402) {
        // The server is the source of truth; resync in case the badge was stale.
        useAuthStore
          .getState()
          .refresh()
          .catch(() => {});
        openPaywall(() => void generate(mode, trimmed));
        return;
      }
      console.error(err);
      toast.error(errorMessage(err, mode));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
      if (abortRef.current === abort) abortRef.current = null;
    }
  }

  return (
    <FloatingPanel className="bottom-3 left-1/2 w-[34rem] max-w-[calc(100%-30rem)] -translate-x-1/2 p-1.5">
      <form className="flex items-center gap-1.5" onSubmit={submit}>
        <ToggleGroup
          type="single"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          aria-label="What to generate"
          className="shrink-0"
          disabled={busy}
        >
          <ToggleGroupItem value="diagram" aria-label="Diagram" title="Diagram">
            <Workflow />
          </ToggleGroupItem>
          <ToggleGroupItem value="chart" aria-label="Chart" title="Chart">
            <ChartColumn />
          </ToggleGroupItem>
        </ToggleGroup>
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => {
            if (!pro) {
              inputRef.current?.blur();
              openPaywall();
              return;
            }
            // elkjs is large; start fetching it once the bar is used rather than on page load.
            preloadElk();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          maxLength={AI_LIMITS.maxPromptLength}
          disabled={busy}
          placeholder={PLACEHOLDER[mode]}
          aria-label={`${mode === "diagram" ? "Diagram" : "Chart"} prompt`}
          className="h-8 min-w-0 border-0 shadow-none focus-visible:ring-0"
        />
        {!pro && (
          <button
            type="button"
            onClick={() => openPaywall()}
            title="AI generation is a Pro feature"
            className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
          >
            Pro
          </button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={PRIVACY_NOTE}
              className="shrink-0 cursor-help text-muted-foreground"
            >
              <Info className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64">
            {PRIVACY_NOTE}
          </TooltipContent>
        </Tooltip>
        <Button type="submit" size="sm" disabled={!canSubmit} className="shrink-0">
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy ? "Generating…" : "Generate"}
        </Button>
      </form>
    </FloatingPanel>
  );
}
