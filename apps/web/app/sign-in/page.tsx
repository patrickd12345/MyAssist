import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata = {
  title: "Sign in · MyAssist",
  description: "Sign in to MyAssist",
};

export default function SignInPage() {
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
