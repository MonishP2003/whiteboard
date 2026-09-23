import { forwardRef, useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff, Lock, PenTool, Shapes, Sparkles, Cloud, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: Sparkles, text: "Describe a diagram or chart and let AI draw it" },
  { icon: Shapes, text: "Shapes, sticky notes, connectors and freehand ink" },
  { icon: Cloud, text: "Every change saved automatically" },
];

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex h-full overflow-auto bg-background">
      <BrandPanel />
      <main className="relative flex min-h-full flex-1 items-center justify-center px-4 py-10 sm:px-8">
        {/* Faint dot grid so the form side still reads as a canvas. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-zinc-300)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] lg:hidden"
        />
        <div className="relative w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <div className="mb-8 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
          <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg shadow-sm",
          inverted ? "bg-white text-zinc-950" : "bg-primary text-primary-foreground",
        )}
      >
        <PenTool className="size-4.5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Whiteboard</span>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden w-[46%] max-w-2xl shrink-0 flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-white lg:flex xl:p-14">
      {/* Glows + dot grid backdrop. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-96 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute -right-24 bottom-10 size-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <Logo inverted className="relative" />

      <div className="relative mx-auto w-full max-w-md py-10">
        <CanvasIllustration />
      </div>

      <div className="relative space-y-6">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
          Think out loud,
          <br />
          <span className="bg-gradient-to-r from-amber-200 via-pink-300 to-indigo-300 bg-clip-text text-transparent">
            on an infinite canvas.
          </span>
        </h2>
        <ul className="space-y-3 text-sm text-zinc-300">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/10">
                <Icon className="size-3.5 text-white" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** A little board scene: sticky note, shapes, connectors and a collaborator cursor. */
function CanvasIllustration() {
  return (
    <svg viewBox="0 0 400 280" className="w-full drop-shadow-2xl" aria-hidden>
      <defs>
        <marker
          id="auth-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#a1a1aa" />
        </marker>
      </defs>

      {/* Connectors */}
      <g
        fill="none"
        stroke="#a1a1aa"
        strokeWidth="2"
        strokeDasharray="5 5"
        markerEnd="url(#auth-arrow)"
      >
        <path d="M150 85 C 190 85, 195 60, 232 60" />
        <path d="M300 102 C 300 130, 300 140, 300 158" />
        <path d="M252 212 C 200 230, 170 230, 142 222" />
      </g>

      {/* Sticky note */}
      <g
        transform="rotate(-5 90 85)"
        className="motion-safe:animate-[auth-float_6s_ease-in-out_infinite]"
      >
        <rect x="30" y="28" width="118" height="112" rx="4" fill="#fde68a" />
        <rect x="30" y="28" width="118" height="14" rx="4" fill="#fcd34d" />
        <g stroke="#92400e" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round">
          <line x1="44" y1="62" x2="130" y2="62" />
          <line x1="44" y1="80" x2="118" y2="80" />
          <line x1="44" y1="98" x2="126" y2="98" />
          <line x1="44" y1="116" x2="96" y2="116" />
        </g>
      </g>

      {/* Rounded rectangle */}
      <rect
        x="236"
        y="22"
        width="130"
        height="78"
        rx="12"
        fill="#1e1b4b"
        stroke="#818cf8"
        strokeWidth="2"
      />
      <g stroke="#c7d2fe" strokeWidth="3" strokeLinecap="round">
        <line x1="256" y1="50" x2="344" y2="50" />
        <line x1="256" y1="70" x2="318" y2="70" />
      </g>

      {/* Diamond */}
      <path
        d="M300 160 L346 200 L300 240 L254 200 Z"
        fill="#500724"
        stroke="#f472b6"
        strokeWidth="2"
      />
      <line
        x1="284"
        y1="200"
        x2="316"
        y2="200"
        stroke="#fbcfe8"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Ellipse */}
      <ellipse cx="96" cy="214" rx="50" ry="32" fill="#052e16" stroke="#4ade80" strokeWidth="2" />
      <line
        x1="76"
        y1="214"
        x2="116"
        y2="214"
        stroke="#bbf7d0"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Freehand scribble */}
      <path
        d="M168 150 c 10 -18, 22 12, 32 -4 s 16 -14, 26 2"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Collaborator cursor */}
      <g
        transform="translate(196 108)"
        className="motion-safe:animate-[auth-cursor_7s_ease-in-out_infinite]"
      >
        <path
          d="M0 0 L0 20 L5.5 15 L9.5 24 L13 22.5 L9 13.5 L16 13.5 Z"
          fill="#fff"
          stroke="#18181b"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect x="14" y="22" width="40" height="18" rx="9" fill="#6366f1" />
        <text
          x="34"
          y="34.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#fff"
          fontFamily="system-ui, sans-serif"
        >
          You
        </text>
      </g>
    </svg>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
    >
      {message}
    </p>
  );
}

/** Input with a leading icon. Spreads remaining props onto the input so FormControl's id/aria reach it. */
export const IconInput = forwardRef<
  HTMLInputElement,
  ComponentProps<"input"> & { icon: LucideIcon; trailing?: ReactNode }
>(function IconInput({ icon: Icon, trailing, className, ...props }, ref) {
  return (
    <div className="relative">
      <Icon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input ref={ref} className={cn("h-11 pl-9", trailing && "pr-10", className)} {...props} />
      {trailing && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
      )}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);
    const Toggle = visible ? EyeOff : Eye;
    return (
      <IconInput
        ref={ref}
        icon={Lock}
        type={visible ? "text" : "password"}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Toggle className="size-4" />
          </button>
        }
        {...props}
      />
    );
  },
);
