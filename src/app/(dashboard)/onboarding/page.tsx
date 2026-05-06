import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO } from "@/lib/demo-data";
import OnboardingWizard from "./onboarding-wizard";

export const metadata = { title: "Configura tu estudio de tatuajes" };

export default async function OnboardingPage() {
  if (IS_DEMO) {
    return <OnboardingWizard userId="demo-user-1" />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: shop } = await supabase
    .from("shops").select("id").eq("owner_id", user.id).single();

  if (shop) redirect("/dashboard");

  return <OnboardingWizard userId={user.id} />;
}
