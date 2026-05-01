import { redirect } from "next/navigation";

// Family lands on the all-teams stages matrix — that's the most informative
// at-a-glance view: who's winning, who scored what stage, where reserves
// kicked in. Middleware lets this through unauthenticated.
export default function HomePage() {
  redirect("/matrix");
}
