import React, { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationTagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function LocationTagInput({
  value = [],
  onChange,
  placeholder = "Add location...",
  className,
  disabled = false,
}: LocationTagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Add only on Enter (not comma) - this allows "City, State" formats
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      const newLocation = inputValue.trim();
      
      // Don't add duplicates
      if (!value.includes(newLocation)) {
        onChange([...value, newLocation]);
      }
      
      setInputValue("");
    } 
    // Remove last location on backspace if input is empty
    else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleRemoveLocation = (locationToRemove: string) => {
    onChange(value.filter(location => location !== locationToRemove));
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 w-full min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {value.map((location, index) => (
        <div
          key={`${location}-${index}`}
          className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1"
        >
          <span>{location}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => handleRemoveLocation(location)}
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