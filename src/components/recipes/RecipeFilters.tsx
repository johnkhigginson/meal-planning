"use client";

import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Filter chips are toggle buttons: outlined when off, lemon fill when on.
const chip =
  "h-8 cursor-pointer gap-1.5 bg-card px-3 text-[13px] font-semibold transition-colors duration-200 ease-out hover:bg-muted [&>svg]:size-3.5!";
const chipOn = "border-transparent bg-brand font-bold text-brand-foreground hover:bg-brand/85";

interface Tag {
  id: number;
  name: string;
}

interface RecipeFiltersProps {
  sourceType: string;
  onSourceTypeChange: (value: string) => void;
  selectedTagIds: number[];
  onTagToggle: (tagId: number) => void;
  tags: Tag[];
  favoritesOnly: boolean;
  onFavoritesChange: (value: boolean) => void;
}

export function RecipeFilters({
  sourceType,
  onSourceTypeChange,
  selectedTagIds,
  onTagToggle,
  tags,
  favoritesOnly,
  onFavoritesChange,
}: RecipeFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={sourceType} onValueChange={(v) => onSourceTypeChange(v ?? "ALL")}>
        <SelectTrigger className="w-40" aria-label="Recipe source">
          <SelectValue placeholder="All sources">
            {{ ALL: "All sources", PERSONAL: "Personal", WEBSITE: "Website", BOOK: "Book" }[sourceType] ?? "All sources"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All sources</SelectItem>
          <SelectItem value="PERSONAL">Personal</SelectItem>
          <SelectItem value="WEBSITE">Website</SelectItem>
          <SelectItem value="BOOK">Book</SelectItem>
        </SelectContent>
      </Select>

      <Badge
        variant="outline"
        render={<button type="button" aria-pressed={favoritesOnly} />}
        className={cn(chip, favoritesOnly && chipOn)}
        onClick={() => onFavoritesChange(!favoritesOnly)}
      >
        <Heart className="fill-red-600 text-red-600" />
        Favorites
      </Badge>

      {tags.map((tag) => {
        const on = selectedTagIds.includes(tag.id);
        return (
          <Badge
            key={tag.id}
            variant="outline"
            render={<button type="button" aria-pressed={on} />}
            className={cn(chip, on && chipOn)}
            onClick={() => onTagToggle(tag.id)}
          >
            {tag.name}
          </Badge>
        );
      })}
    </div>
  );
}
