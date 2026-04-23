import { Suspense } from "react";
import { SignInForm } from "@/app/sign-in/SignInForm";

export function RefactorSignInPage() {
  return (
    <div className="ui-variant-refactor-auth">
      <Suspense
        fallback={
          <div className="theme-muted flex min-h-[50vh] items-center justify-center text-sm">Loading...</div>
        }
      >
        <SignInForm />
      </Suspense>
    </div>
  );
}

