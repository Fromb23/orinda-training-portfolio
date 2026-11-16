import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AssignmentEditor from "@/components/AssignmentEditor";

export const dynamic = "force-dynamic";

export default async function NewAssignmentPage() {
  if (!await getSession("MANAGEMENT")) redirect("/?access=session&role=management");
  return <AssignmentEditor assignment={null}/>;
}
