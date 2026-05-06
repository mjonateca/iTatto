"use client";

import { FormEvent, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmMode = "payment" | "setup";

function InnerStripePanel({
  mode,
  returnUrl,
  buttonLabel,
  onSuccess,
}: {
  mode: ConfirmMode;
  returnUrl?: string;
  buttonLabel: string;
  onSuccess?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const result =
      mode === "payment"
        ? await stripe.confirmPayment({
            elements,
            confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
            redirect: "if_required",
          })
        : await stripe.confirmSetup({
            elements,
            confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
            redirect: "if_required",
          });

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message || "No se pudo completar la operación.");
      return;
    }

    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!stripe || !elements || submitting} className="w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonLabel}
      </Button>
    </form>
  );
}

export function StripeElementsPanel({
  clientSecret,
  mode,
  buttonLabel,
  onSuccess,
}: {
  clientSecret: string;
  mode: ConfirmMode;
  buttonLabel: string;
  onSuccess?: () => void;
}) {
  const stripePromise = useMemo(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return publishableKey ? loadStripe(publishableKey) : null;
  }, []);

  if (!stripePromise) {
    return <p className="text-sm text-muted-foreground">Falta configurar `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.</p>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <InnerStripePanel mode={mode} buttonLabel={buttonLabel} onSuccess={onSuccess} />
    </Elements>
  );
}
