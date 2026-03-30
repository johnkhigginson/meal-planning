"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="flex flex-wrap items-center gap-3">
      <Select value={sourceType} onValueChange={(v) => onSourceTypeChange(v ?? "ALL")}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Sources</SelectItem>
          <SelectItem value="PERSONAL">Personal</SelectItem>
          <SelectItem value="WEBSITE">Website</SelectItem>
          <SelectItem value="BOOK">Book</SelectItem>
        </SelectContent>
      </Select>

      <Badge
        variant={favoritesOnly ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onFavoritesChange(!favoritesOnly)}
      >
        Favorites
      </Badge>

      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge
            key={tag.id}
            variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => onTagToggle(tag.id)}
          >
            {tag.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
