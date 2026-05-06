"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scissors, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import StepShopInfo from "./steps/step-shop-info";
import StepServices from "./steps/step-services";
import StepBarber from "./steps/step-barber";

export interface OnboardingData {
  // Paso 1
  shopName: string;
  slug: string;
  phone: string;
  address: string;
  countryCode: string;
  countryName: string;
  city: string;
  currency: string;
  description: string;
  // Paso 2
  services: Array<{ name: string; duration_min: number; price: number }>;
  // Paso 3 — tatuador principal (el dueño)
  barberName: string;
  barberBio: string;
}

const STEPS = [
  { label: "Tu estudio de tatuajes", description: "Información básica" },
  { label: "Servicios",   description: "Qué ofreces" },
  { label: "Tu perfil",  description: "Perfil de tatuador" },
];

export default function OnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Partial<OnboardingData>>({
    services: [
      { name: "Tatuaje de cabello", duration_min: 30, price: 350 },
      { name: "Tatuaje + barba",    duration_min: 45, price: 550 },
      { name: "Barba",            duration_min: 20, price: 300 },
    ],
  });

  function updateData(partial: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleComplete(shopSlug: string) {
    router.push(`/dashboard?new=1&slug=${shopSlug}`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="bg-primary rounded-xl p-2">
            <Scissors className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">iTatto</p>
            <p className="text-xs text-muted-foreground">Configuración inicial</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-10">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                    i < step
                      ? "bg-primary text-white"
                      : i === step
                      ? "bg-primary text-white ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="mt-1 text-center hidden sm:block">
                  <p className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
                    {s.label}
                  </p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 transition-colors",
                    i < step ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 0 && (
          <StepShopInfo
            data={data}
            onUpdate={updateData}
            onNext={goNext}
            userId={userId}
          />
        )}
        {step === 1 && (
          <StepServices
            data={data}
            onUpdate={updateData}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 2 && (
          <StepBarber
            data={data}
            onUpdate={updateData}
            onBack={goBack}
            onComplete={handleComplete}
            userId={userId}
          />
        )}
      </div>
    </div>
  );
}
