import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 py-10">
      <SignUp />
    </main>
  );
}
