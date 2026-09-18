import { redirect } from "next/navigation";

import { getBusinessToday } from "@/lib/business-logic";

export default function HomePage() {
  redirect(`/checklist/${getBusinessToday()}`);
}
