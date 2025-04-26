import React, { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TagInput({
  value = [],
  onChange,
  placeholder = "Add tag...",
  className,
  disabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Add on Enter or comma
    if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      
      // Don't add duplicates
      if (!value.includes(newTag)) {
        onChange([...value, newTag]);
      }
      
      setInputValue("");
    } 
    // Remove last tag on backspace if input is empty
    else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 w-full min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {value.map((tag, index) => (
        <div
          key={`${tag}-${index}`}
          className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1"
        >
          <span>{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 bg-transparent focus:outline-none min-w-[120px] placeholder:text-muted-foreground"
        disabled={disabled}
      />
    </div>
  );
}