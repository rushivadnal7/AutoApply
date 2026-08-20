import clsx from "clsx";

const COLOR_MAP: Record<string, string> = {
  applied: "bg-green-100 text-green-800",
  connected: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  skipped: "bg-amber-100 text-amber-800",
  paused: "bg-amber-100 text-amber-800",
  reauth_required: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
  stopped: "bg-red-100 text-red-800",
  processing: "bg-blue-100 text-blue-800",
  starting: "bg-blue-100 text-blue-800",
  logging_in: "bg-blue-100 text-blue-800",
  searching: "bg-blue-100 text-blue-800",
  analyzing: "bg-blue-100 text-blue-800",
  applying: "bg-blue-100 text-blue-800",
  waiting: "bg-blue-100 text-blue-800",
  resuming: "bg-blue-100 text-blue-800",
  idle: "bg-gray-100 text-gray-700",
  disconnected: "bg-gray-100 text-gray-700",
};

export function StatusBadge({ status }: { status: string }) {
  const color = COLOR_MAP[status] ?? "bg-gray-100 text-gray-700";
  return <span className={clsx("badge", color)}>{status.replace(/_/g, " ")}</span>;
}
