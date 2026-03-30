"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Unit {
  id: number;
  name: string;
  abbreviation: string;
  unitType: string;
}

interface QuantityUnitInputProps {
  quantity: number;
  unitId: number;
  units: Unit[];
  onQuantityChange: (quantity: number) => void;
  onUnitChange: (unitId: number) => void;
}

export function QuantityUnitInput({
  quantity,
  unitId,
  units,
  onQuantityChange,
  onUnitChange,
}: QuantityUnitInputProps) {
  const grouped = units.reduce(
    (acc, unit) => {
      const type = unit.unitType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(unit);
      return acc;
    },
    {} as Record<string, Unit[]>
  );

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={0}
        step="any"
        value={quantity || ""}
        onChange={(e) => onQuantityChange(parseFloat(e.target.value) || 0)}
        className="w-24"
        placeholder="Qty"
      />
      <Select
        value={unitId ? unitId.toString() : undefined}
        onValueChange={(v) => v && onUnitChange(parseInt(v, 10))}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Unit" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(grouped).map(([type, groupUnits]) => (
            <SelectGroup key={type}>
              <SelectLabel>{type}</SelectLabel>
              {groupUnits.map((unit) => (
                <SelectItem key={unit.id} value={unit.id.toString()}>
                  {unit.name} ({unit.abbreviation})
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
