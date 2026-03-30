"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Save, UserPlus, X, Users } from "lucide-react";

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
  role: string;
  household: {
    id: number;
    name: string;
    members: HouseholdMember[];
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [name, setName] = useState("");
  const [enabledSlots, setEnabledSlots] = useState<string[]>([]);
  const [householdName, setHouseholdName] = useState("");
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

  async function handleSave() {
    if (enabledSlots.length === 0) return;
    setSaving(true);
    const res = await fetch("/api/user/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabledMealSlots: enabledSlots.join(","), householdName }),
    });
    if (res.ok) setSaved(true);
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

  if (!settings) return <p className="text-muted-foreground">Loading...</p>;

  const isOwner = settings.role === "OWNER";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
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
        </CardContent>
      </Card>

      {/* Meal Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Meal Plan Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose which meals to show in your weekly meal plan.
          </p>
          {ALL_MEAL_SLOTS.map((slot) => (
            <label key={slot.value} className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={enabledSlots.includes(slot.value)}
                onCheckedChange={() => toggleSlot(slot.value)}
              />
              <span className="text-sm font-medium">{slot.label}</span>
            </label>
          ))}
          {enabledSlots.length === 0 && (
            <p className="text-sm text-destructive">Select at least one meal slot</p>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || enabledSlots.length === 0}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
        {saved && <span className="text-sm text-green-600">Settings saved</span>}
      </div>

      {/* Household */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Household</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwner && (
            <div className="space-y-2">
              <Label htmlFor="householdName">Household Name</Label>
              <Input
                id="householdName"
                value={householdName}
                onChange={(e) => { setHouseholdName(e.target.value); setSaved(false); }}
              />
            </div>
          )}
          {!isOwner && (
            <div className="space-y-2">
              <Label>Household Name</Label>
              <p className="text-sm">{settings.household.name}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Members</Label>
            {settings.household.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
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
              <Label className="text-muted-foreground">Pending Invites</Label>
              {invites
                .filter((i) => i.status === "PENDING")
                .map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between rounded-lg border border-dashed p-3">
                    <div>
                      <p className="text-sm">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited {new Date(invite.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {isOwner && (
                      <Button variant="ghost" size="sm" onClick={() => cancelInvite(invite.id)}>
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
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="partner@email.com"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); setInviteSuccess(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Invite
                </Button>
              </div>
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
              {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
