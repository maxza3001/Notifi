export const dashboardStatusValues = [
  "รออนุมัติ",
  "รับเรื่องแล้ว",
  "รอพิจารณา",
  "อนุมัติแล้ว",
] as const;

export type DashboardStatus = (typeof dashboardStatusValues)[number];

export function getStatusTone(status: string) {
  if (status === "รับเรื่องแล้ว") return "received";
  if (status === "รอพิจารณา") return "review";
  if (status === "อนุมัติแล้ว") return "approved";
  if (status === "ยกเลิก") return "cancelled";
  return "pending";
}
