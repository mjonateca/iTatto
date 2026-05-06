"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Scissors } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingData } from "../onboarding-wizard";

const serviceSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  duration_min: z.coerce.number().min(5, "Mínimo 5 min").max(480, "Máximo 8h"),
  price: z.coerce.number().min(1, "Precio requerido"),
});

type ServiceForm = z.infer<typeof serviceSchema>;

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (d: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepServices({ data, onUpdate, onNext, onBack }: Props) {
  const [services, setServices] = useState(
    data.services || [
      { name: "Tatuaje de cabello", duration_min: 30, price: 350 },
      { name: "Tatuaje + barba",    duration_min: 45, price: 550 },
      { name: "Barba",            duration_min: 20, price: 300 },
    ]
  );
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { duration_min: 30, price: 350 },
  });

  function addService(d: ServiceForm) {
    const updated = [...services, d];
    setServices(updated);
    reset({ duration_min: 30, price: 350 });
    setShowForm(false);
  }

  function removeService(i: number) {
    setServices(services.filter((_, idx) => idx !== i));
  }

  function handleContinue() {
    if (services.length === 0) return;
    onUpdate({ services });
    onNext();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="bg-primary/10 rounded-xl p-2.5">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Servicios</CardTitle>
            <CardDescription>¿Qué ofrece tu estudio?</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Lista de servicios */}
        <div className="space-y-2">
          {services.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl border bg-muted/30"
            >
              <div>
                <p className="font-medium text-sm">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.duration_min} min · {formatCurrency(s.price)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeService(i)}
                className="text-muted-foreground hover:text-destructive h-8 w-8"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {services.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Agrega al menos un servicio para continuar
            </p>
          )}
        </div>

        {/* Formulario para agregar servicio */}
        {showForm ? (
          <form
            onSubmit={handleSubmit(addService)}
            className="border rounded-xl p-4 space-y-3 bg-muted/20"
          >
            <p className="font-medium text-sm">Nuevo servicio</p>

            <div className="space-y-1">
              <Label htmlFor="svc-name">Nombre</Label>
              <Input id="svc-name" placeholder="Color, Tratamiento..." {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="svc-duration">Duración (min)</Label>
                <Input id="svc-duration" type="number" {...register("duration_min")} />
                {errors.duration_min && (
                  <p className="text-xs text-destructive">{errors.duration_min.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="svc-price">Precio (RD$)</Label>
                <Input id="svc-price" type="number" {...register("price")} />
                {errors.price && (
                  <p className="text-xs text-destructive">{errors.price.message}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1">Agregar</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar servicio
          </Button>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack} className="flex-1">
            ← Volver
          </Button>
          <Button
            onClick={handleContinue}
            disabled={services.length === 0}
            className="flex-1"
          >
            Continuar →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
