import { Scissors } from "lucide-react";
import Link from "next/link";
import { Toaster } from "@/components/ui/toaster";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="bg-primary rounded-xl p-2">
            <Scissors className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">iTatto</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
