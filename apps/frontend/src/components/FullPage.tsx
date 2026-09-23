import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function NotFoundPage({ message = "Page not found." }: { message?: string }) {
  return (
    <FullPageMessage>
      <p className="text-base text-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to="/boards">Back to your boards</Link>
      </Button>
    </FullPageMessage>
  );
}
