"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/shared/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { PageLoader } from "@/components/shared/PageLoader";

interface LogRow {
  id: number;
  createdAt: string;
  category: string;
  action: string;
  summary: string;
  actorName: string | null;
  ip: string | null;
}

const CATEGORIES = ["ALL", "AUTH", "RECIPE", "BOOK", "COMMENT", "IMPORT", "USER", "ADMIN"];

const CATEGORY_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  AUTH: "secondary",
  ADMIN: "default",
  IMPORT: "secondary",
};

const PAGE_SIZE = 50;

export default function AdminLogsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { systemRole?: string } | undefined)?.systemRole === "ADMIN";

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (category !== "ALL") params.set("category", category);
    if (search) params.set("q", search);
    const res = await fetch(`/api/admin/logs?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, category, search]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <div className="py-12 text-center text-muted-foreground">Only admins can view the activity log.</div>;
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ScrollText className="h-6 w-6" /> Activity Log
          </h1>
          <p className="text-sm text-muted-foreground">{total} recorded events</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search events or people…"
          />
        </div>
        <Select value={category} onValueChange={(v) => { if (v) { setCategory(v); setPage(1); } }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue>{category === "ALL" ? "All categories" : category}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === "ALL" ? "All categories" : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <PageLoader />
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No events found.</div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card px-4 py-2.5 shadow-sm sm:flex-row sm:items-center sm:gap-3"
            >
              <Badge variant={CATEGORY_VARIANTS[log.category] ?? "outline"} className="w-fit text-[10px]">
                {log.category}
              </Badge>
              <span className="flex-1 text-sm">{log.summary}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
