import { redirect } from "next/navigation";

// The "Próximos" page was merged into Torneios (grouped by status).
export default function UpcomingPage() {
  redirect("/tournaments");
}
