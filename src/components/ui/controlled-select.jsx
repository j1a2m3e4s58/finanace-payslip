import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ControlledSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
  contentClassName = "",
  emptyLabel = "",
}) {
  const emptyValue = "__empty__";
  const normalizedOptions = (options || []).map((option) => (
    typeof option === "string" ? { value: option, label: option } : option
  ));
  return (
    <Select
      value={value || (emptyLabel ? emptyValue : "")}
      onValueChange={(next) => onChange(next === emptyValue ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {emptyLabel && (
          <SelectItem value={emptyValue}>
            {emptyLabel}
          </SelectItem>
        )}
        {normalizedOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
