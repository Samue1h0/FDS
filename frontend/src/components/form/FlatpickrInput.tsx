"use client";

import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import type { Instance } from "flatpickr/dist/types/instance";

interface FlatpickrInputProps {
  value:        string;            // YYYY-MM-DD ("" = empty)
  minDate?:     string;
  maxDate?:     string;
  disabled?:    boolean;
  placeholder?: string;
  className?:   string;
  onChange:     (date: string) => void;
}

/**
 * Single-date flatpickr input with reactive min/max bounds. Created once, then
 * updated via `.set()`/`.setDate()` so changing the selectable window (e.g. when
 * filters change) doesn't recreate the instance.
 */
export default function FlatpickrInput({
  value, minDate, maxDate, disabled, placeholder, className, onChange,
}: FlatpickrInputProps) {
  const inputRef    = useRef<HTMLInputElement>(null);
  const fpRef       = useRef<Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current) return;
    const fp = flatpickr(inputRef.current, {
      dateFormat:        "Y-m-d",
      monthSelectorType: "static",   // static month text (no white native <select>)
      defaultDate:       value || undefined,
      minDate:           minDate || undefined,
      maxDate:           maxDate || undefined,
      onChange:          (_dates, dateStr) => onChangeRef.current(dateStr),
    }) as Instance;
    fpRef.current = fp;
    return () => { fp.destroy(); fpRef.current = null; };
    // create once; bounds/value handled by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fpRef.current?.set("minDate", minDate || null); }, [minDate]);
  useEffect(() => { fpRef.current?.set("maxDate", maxDate || null); }, [maxDate]);
  useEffect(() => {
    const fp = fpRef.current;
    if (fp && fp.input.value !== value) fp.setDate(value || "", false);  // false = don't fire onChange
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      readOnly
      disabled={disabled}
      placeholder={placeholder}
      defaultValue={value}
      className={className}
    />
  );
}
