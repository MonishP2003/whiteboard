import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router";
import { RegisterBodySchema, type RegisterBody } from "@whiteboard/shared";
import type { LoginRedirectState } from "@/app/RequireAuth";
import { ArrowRight, Loader2, Mail, User } from "lucide-react";
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

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const from = (useLocation().state as LoginRedirectState | null)?.from ?? "/boards";

  const form = useForm<RegisterBody>({
    resolver: zodResolver(RegisterBodySchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register(values);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        form.setError("email", { message: "An account with this email already exists." });
      } else {
        form.setError("root", { message: "Couldn't create your account. Try again." });
      }
    }
  });

  return (
    <AuthCard
      title="Create an account"
      description="Start sketching in seconds."
      footer={
        <span>
          Already have an account?{" "}
          <Link
            to="/login"
            state={{ from }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </span>
      }
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <IconInput
                    icon={User}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
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
                  <PasswordInput placeholder="••••••••" autoComplete="new-password" {...field} />
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
                Creating account…
              </>
            ) : (
              <>
                Sign up
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
