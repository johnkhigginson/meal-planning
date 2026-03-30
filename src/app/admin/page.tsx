"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UtensilsCrossed, Store, ArrowRight } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

interface UserData {
  id: number;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
  createdAt: string;
  household: { id: number; name: string };
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalHouseholds: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users);
        setStats(data.stats);
        setLoading(false);
      });
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage users and content library</p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
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

      {/* Recent Users */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Users</h2>
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{user.name}</span>
                  {user.isAdmin && <Badge className="text-[10px]">Admin</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
                <div className="mt-0.5 text-xs text-muted-foreground/60">
                  {user.household.name} &middot; {user.role} &middot; Joined {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
