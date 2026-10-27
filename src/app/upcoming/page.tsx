import { redirect } from "next/navigation";

// The "Próximos" page was merged into Torneios: open it on the upcoming filter.
export default function UpcomingPage() {
  redirect("/tournaments?status=proximos");
}
