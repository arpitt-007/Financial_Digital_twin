import * as React from "react";
import { BrandMark } from "@/components/BrandMark";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/state/AppState";

type Mode = "login" | "signup";

export function Login() {
  const { login, signup } = useAppState();
  const [mode, setMode] = React.useState<Mode>("login");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const isSignup = mode === "signup";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (isSignup && !name.trim()) return setError("Please enter your name.");
    if (!email.trim()) return setError("Please enter your email.");
    if (password.length < (isSignup ? 8 : 1))
      return setError(isSignup ? "Password must be at least 8 characters." : "Please enter your password.");

    setSubmitting(true);
    setError(null);
    try {
      if (isSignup) await signup(email.trim(), name.trim(), password);
      else await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Can't reach the server. Is the backend running?"
          : err instanceof Error
            ? err.message
            : "Something went wrong."
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[440px] animate-fadeIn">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <BrandMark size={28} />
          <span className="font-display font-bold text-lg tracking-wide">TWIN</span>
        </div>

        <Card className="p-10 max-[480px]:p-6">
          <div className="font-display text-[11px] tracking-[0.14em] text-accent mb-2.5">
            {isSignup ? "CREATE YOUR TWIN" : "WELCOME BACK"}
          </div>
          <h1 className="font-display text-[22px] font-semibold mb-[26px]">
            {isSignup ? "Start modelling your future" : "Sign in to your twin"}
          </h1>

          <form onSubmit={submit} noValidate>
            {isSignup && (
              <div className="mb-[18px]">
                <label className="text-[12.5px] text-text-dim mb-2 block">Your name</label>
                <Input
                  autoComplete="name"
                  placeholder="Alex"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="mb-[18px]">
              <label className="text-[12.5px] text-text-dim mb-2 block">Email</label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="mb-[18px]">
              <label className="text-[12.5px] text-text-dim mb-2 block">Password</label>
              <Input
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-[12.5px] text-neg mb-3">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full mt-2" disabled={submitting}>
              {submitting ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Card>

        <div className="text-center mt-[22px] text-[13px] text-text-faint">
          {isSignup ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            className="bg-transparent border-none text-accent font-semibold text-[13px] cursor-pointer p-0 hover:underline"
            onClick={() => switchMode(isSignup ? "login" : "signup")}
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
