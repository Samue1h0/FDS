"use client";
import { useCallback, useState } from "react";

export const useDropdown = (initialOpenId: number | null = null) => {
  const [openId, setOpenId] = useState<number | null>(initialOpenId);

  const openDropdown = useCallback((id: number) => {
    setOpenId(id);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpenId(null);
  }, []);

  const toggleDropdown = useCallback((id: number) => {
    setOpenId((currentId) => (currentId === id ? null : id));
  }, []);

  return { openId, openDropdown, closeDropdown, toggleDropdown };
};