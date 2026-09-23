import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router";
import { LoginBodySchema, type LoginBody } from "@whiteboard/shared";
import type { LoginRedirectState } from "@/app/RequireAuth";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { AuthCard, FormError, IconInput, PasswordInput } from "./AuthCard";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from = (useLocation().state as LoginRedirectState | null)?.from ?? "/boards";

  const form = useForm<LoginBody>({
    resolver: zodResolver(LoginBodySchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (err) {
      form.setError("root", {
        message:
          err instanceof ApiError && err.code === "INVALID_CREDENTIALS"
            ? "Wrong email or password."
            : "Couldn't log in. Try again.",
      });
    }
  });

  return (
    <AuthCard
      title="Log in"
      description="Welcome back. Log in to pick up where you left off."
      footer={
        <span>
          No account?{" "}
          <Link
            to="/register"
            state={{ from }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </span>
      }
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <IconInput
                    icon={Mail}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="••••••••"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormError message={form.formState.errors.root?.message} />
          <Button
            type="submit"
            size="lg"
            className="group h-11 w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Logging in…
              </>
            ) : (
              <>
                Log in
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
