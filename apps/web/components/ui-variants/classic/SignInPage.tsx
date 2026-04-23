import { Suspense } from "react";
import { SignInForm } from "@/app/sign-in/SignInForm";

export function ClassicSignInPage() {
  return (
    <Suspense
      fallback={
        <div className="theme-muted flex min-h-[50vh] items-center justify-center text-sm">Loading...</div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

