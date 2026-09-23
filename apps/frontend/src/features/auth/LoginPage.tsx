import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router";
import { LoginBodySchema, type LoginBody } from "@whiteboard/shared";
import type { LoginRedirectState } from "@/app/RequireAuth";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { AuthCard, FormError } from "./AuthCard";

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
      description="Welcome back."
      footer={
        <span>
          No account?{" "}
          <Link
            to="/register"
            state={{ from }}
            className="text-foreground underline underline-offset-4"
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
                  <Input type="email" autoComplete="email" autoFocus {...field} />
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
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormError message={form.formState.errors.root?.message} />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
