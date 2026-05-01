// Family doesn't submit teams individually — Sofia uploads a Word doc
// from the in-laws containing all teams. Keep this path as a redirect
// so any old "/submit" links land somewhere useful.
import { redirect } from "next/navigation";

export default function SubmitRedirect() {
  redirect("/admin/upload");
}
