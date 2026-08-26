"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Candidate Profile" },
  { href: "/resumes", label: "Resumes" },
  { href: "/roles", label: "Job Roles" },
  { href: "/portals", label: "Job Portals" },
  { href: "/bot", label: "Bot Control" },
  { href: "/applications", label: "Applications" },
  { href: "/runs", label: "Bot Runs" },
  { href: "/logs", label: "Activity Logs" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-5">
          <p className="text-sm font-semibold text-gray-900">AutoApply</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "block rounded-lg px-3 py-2 text-sm font-medium",
                pathname === item.href ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <button onClick={() => logout().then(() => router.replace("/login"))} className="btn-secondary w-full">
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
