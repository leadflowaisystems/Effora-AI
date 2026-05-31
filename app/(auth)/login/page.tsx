import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Effora AI" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Effora AI</h1>
          <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
