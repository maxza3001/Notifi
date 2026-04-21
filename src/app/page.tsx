import { RequestConsole } from "@/components/request-console";
import { AGENCY_LIST } from "@/lib/agencies";

export default function Home() {
  return <RequestConsole agencies={AGENCY_LIST} />;
}
