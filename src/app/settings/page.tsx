"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Save, UserPlus, X, Users, LayoutDashboard, Upload } from "lucide-react";
import { useSession } from "next-auth/react";
import SettingsSkeleton from "./loading";
import { OPTIONAL_NAV_ITEMS, parseHiddenNav } from "@/lib/nav";

const ALL_MEAL_SLOTS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "SNACK", label: "Snack" },
];

interface HouseholdMember {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Invite {
  id: number;
  email: string;
  status: string;
  createdAt: string;
}

interface UserSettings {
  id: number;
  name: string;
  email: string;
  enabledMealSlots: string;
  hiddenNavItems: string;
  bio: string | null;
  avatarUrl: string | null;
  role: string;
  household: {
    id: number;
    name: string;
    members: HouseholdMember[];
  };
}

export default function SettingsPage() {
  const { update } = useSession();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [name, setName] = useState("");
  const [enabledSlots, setEnabledSlots] = useState<string[]>([]);
  const [hiddenNav, setHiddenNav] = useState<Set<string>>(new Set());
  const [householdName, setHouseholdName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Invite state
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setName(data.name);
        setHouseholdName(data.household?.name || "");
        setEnabledSlots(data.enabledMealSlots.split(",").filter(Boolean));
        setHiddenNav(parseHiddenNav(data.hiddenNavItems));
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? null);
      });
    fetch("/api/household/invites")
      .then((r) => r.json())
      .then(setInvites);
  }, []);

  function toggleSlot(slot: string) {
    setEnabledSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    );
    setSaved(false);
  }

  // Nav toggles are framed as "show" for clarity; we store the hidden set.
  function toggleNavVisible(href: string, visible: boolean) {
    setHiddenNav((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(href);
      else next.add(href);
      return next;
    });
    setSaved(false);
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        setAvatarUrl(data.url);
        setSaved(false);
      }
    } finally {
      setAvatarUploading(false);
      if (avatarRef.current) avatarRef.current.value = "";
    }
  }

  async function handleSave() {
    if (enabledSlots.length === 0) return;
    setSaving(true);
    const hiddenNavItems = Array.from(hiddenNav).join(",");
    const res = await fetch("/api/user/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabledMealSlots: enabledSlots.join(","), householdName, hiddenNavItems, bio, avatarUrl }),
    });
    if (res.ok) {
      setSaved(true);
      // Refresh the session token so the sidebar/menu updates immediately.
      await update({ hiddenNavItems });
    }
    setSaving(false);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");

    const res = await fetch("/api/household/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });

    if (res.ok) {
      const invite = await res.json();
      setInvites((prev) => [invite, ...prev]);
      setInviteEmail("");
      setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
    } else {
      const data = await res.json();
      setInviteError(data.error || "Failed to send invite");
    }
    setInviting(false);
  }

  async function cancelInvite(id: number) {
    await fetch(`/api/household/invites?id=${id}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.id !== id));
  }

  if (!settings) return <SettingsSkeleton />;

  const isOwner = settings.role === "OWNER";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-3xl leading-tight font-medium sm:text-4xl">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={settings.email} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => { setBio(e.target.value); setSaved(false); }}
              rows={3}
              placeholder="A short bio shown on your published blog's About page."
            />
          </div>

          <div className="space-y-2">
            <Label>Photo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-xl font-semibold text-primary">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              <Button type="button" variant="outline" size="sm" onClick={() => avatarRef.current?.click()} disabled={avatarUploading}>
                {avatarUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {avatarUrl ? "Change photo" : "Upload photo"}
              </Button>
              {avatarUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setAvatarUrl(null); setSaved(false); }}>
                  <X className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Shown on your published blog&apos;s About page.</p>
          </div>
        </CardContent>
      </Card>

      {/* Meal Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Meal plan preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Choose which meals to show in your weekly meal plan.
          </p>
          {ALL_MEAL_SLOTS.map((slot) => (
            <label key={slot.value} className="flex min-h-10 cursor-pointer items-center gap-3">
              <Checkbox
                checked={enabledSlots.includes(slot.value)}
                onCheckedChange={() => toggleSlot(slot.value)}
              />
              <span className="text-sm font-semibold">{slot.label}</span>
            </label>
          ))}
          {enabledSlots.length === 0 && (
            <p role="alert" className="text-sm font-semibold text-destructive">Select at least one meal slot</p>
          )}
        </CardContent>
      </Card>

      {/* Menu */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-xl">Menu</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Choose which sections appear in your menu. Recipes and Cookbooks are always shown.
          </p>
          {OPTIONAL_NAV_ITEMS.map((item) => (
            <label key={item.href} className="flex min-h-10 cursor-pointer items-center gap-3">
              <Checkbox
                checked={!hiddenNav.has(item.href)}
                onCheckedChange={(c) => toggleNavVisible(item.href, c === true)}
              />
              <span className="text-sm font-semibold">{item.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Household */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-xl">Household</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwner && (
            <div className="space-y-2">
              <Label htmlFor="householdName">Household name</Label>
              <Input
                id="householdName"
                value={householdName}
                onChange={(e) => { setHouseholdName(e.target.value); setSaved(false); }}
              />
            </div>
          )}
          {!isOwner && (
            <div className="space-y-2">
              <Label>Household name</Label>
              <p className="text-sm">{settings.household.name}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Members</Label>
            {settings.household.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background/60 p-3">
                <div>
                  <p className="text-sm font-bold">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <Badge variant={member.role === "OWNER" ? "default" : "secondary"}>
                  {member.role === "OWNER" ? "Owner" : "Member"}
                </Badge>
              </div>
            ))}
          </div>

          {/* Pending invites */}
          {invites.filter((i) => i.status === "PENDING").length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Pending invites</Label>
              {invites
                .filter((i) => i.status === "PENDING")
                .map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-input p-3">
                    <div>
                      <p className="text-sm">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited {new Date(invite.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {isOwner && (
                      <Button variant="ghost" size="icon" onClick={() => cancelInvite(invite.id)} aria-label={`Cancel invite to ${invite.email}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Invite form */}
          {isOwner && (
            <div className="space-y-2 border-t pt-4">
              <Label>Invite someone to your household</Label>
              <p className="text-xs text-muted-foreground">
                They&apos;ll share your recipes, pantry, meal plans, and grocery lists.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  placeholder="partner@email.com"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); setInviteSuccess(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="h-10">
                  {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Invite
                </Button>
              </div>
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
              {inviteSuccess && <p className="text-sm font-semibold text-leaf-ink">{inviteSuccess}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={handleSave} disabled={saving || enabledSlots.length === 0}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save settings
        </Button>
        {saved && <span role="status" className="text-sm font-semibold text-leaf-ink">Settings saved</span>}
      </div>
    </div>
  );
}
