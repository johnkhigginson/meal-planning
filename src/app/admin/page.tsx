"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UtensilsCrossed, Store, ArrowRight } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

interface UserData {
  id: number;
  name: string;
  email: string;
  role: string;
  systemRole: string;
  createdAt: string;
  household: { id: number; name: string };
}

const ROLE_LABELS: Record<string, string> = {
  USER: "User",
  CONTRIBUTOR: "Contributor",
  ADMIN: "Admin",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  CONTRIBUTOR: "secondary",
  USER: "outline",
};

export default function AdminDashboard() {
  const { data: session } = useSession();
  const systemRole = (session?.user as { systemRole?: string } | undefined)?.systemRole;
  const isAdmin = systemRole === "ADMIN";

  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalHouseholds: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users);
        setStats(data.stats);
        setLoading(false);
      });
  }, [isAdmin]);

  async function changeRole(userId: number, systemRole: string) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, systemRole }),
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, systemRole } : u))
      );
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Manage users, roles, and content library" : "Manage content library"}
        </p>
      </div>

      <div className={`grid gap-3 ${isAdmin ? "sm:grid-cols-3" : ""}`}>
        {isAdmin && (
          <>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalUsers}</div>
                  <div className="text-xs text-muted-foreground">Users</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalHouseholds}</div>
                  <div className="text-xs text-muted-foreground">Households</div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        <Link href="/admin/library">
          <Card className="group transition-all hover:shadow-md">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Content Library</div>
                <div className="text-xs text-muted-foreground">Manage recipes &amp; stores</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {isAdmin && <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Users</h2>
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{user.name}</span>
                  <Badge variant={ROLE_VARIANTS[user.systemRole]} className="text-[10px]">
                    {ROLE_LABELS[user.systemRole]}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
                <div className="mt-0.5 text-xs text-muted-foreground/60">
                  {user.household.name} &middot; Joined {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
              <Select
                value={user.systemRole}
                onValueChange={(v) => v && changeRole(user.id, v)}
              >
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue>
                    {ROLE_LABELS[user.systemRole]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="CONTRIBUTOR">Contributor</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}
