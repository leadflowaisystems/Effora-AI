import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create account — Effora AI" };

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground">Free 14-day trial. No credit card required.</p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
