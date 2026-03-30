"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";

const ALL_MEAL_SLOTS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "SNACK", label: "Snack" },
];

interface UserSettings {
  id: number;
  name: string;
  email: string;
  enabledMealSlots: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [name, setName] = useState("");
  const [enabledSlots, setEnabledSlots] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setName(data.name);
        setEnabledSlots(data.enabledMealSlots.split(",").filter(Boolean));
      });
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
      body: JSON.stringify({
        name,
        enabledMealSlots: enabledSlots.join(","),
      }),
    });
    if (res.ok) {
      setSaved(true);
    }
    setSaving(false);
  }

  if (!settings) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

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
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={settings.email} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meal Plan Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose which meals to show in your weekly meal plan.
          </p>
          {ALL_MEAL_SLOTS.map((slot) => (
            <label
              key={slot.value}
              className="flex cursor-pointer items-center gap-3"
            >
              <Checkbox
                checked={enabledSlots.includes(slot.value)}
                onCheckedChange={() => toggleSlot(slot.value)}
              />
              <span className="text-sm font-medium">{slot.label}</span>
            </label>
          ))}
          {enabledSlots.length === 0 && (
            <p className="text-sm text-destructive">
              Select at least one meal slot
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || enabledSlots.length === 0}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
        {saved && (
          <span className="text-sm text-green-600">Settings saved</span>
        )}
      </div>
    </div>
  );
}
