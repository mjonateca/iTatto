import Link from "next/link";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShopNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-muted rounded-2xl p-6 mb-6">
        <Scissors className="h-12 w-12 text-muted-foreground mx-auto" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Estudio de tatuajes no encontrada</h1>
      <p className="text-muted-foreground mb-8 max-w-sm">
        Esta estudio de tatuajes no existe o fue desactivada. Verifica el enlace e intenta nuevamente.
      </p>
      <Link href="/">
        <Button>Ir al inicio</Button>
      </Link>
    </div>
  );
}
