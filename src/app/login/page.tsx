import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
          <p className="text-center text-brand-muted">Caricamento...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
