"use client";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import {
  BoltIcon,
  BoxCubeIcon,
  ChevronDownIcon,
  GridIcon,
  ListIcon,
} from "@/icons/index";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
  },
  {
    name: "Transactions",
    icon: <ListIcon />,
    path: "/basic-tables",
  },
];

const othersItems: NavItem[] = [
  {
    icon: <BoltIcon />,
    name: "Triggers",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Blockchain",
  },
];

const navigationItems: NavItem[] = [...navItems, ...othersItems];

const AppHeader: React.FC = () => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const isItemActive = (item: NavItem) =>
    item.path ? isActive(item.path) : item.subItems?.some((subItem) => isActive(subItem.path)) ?? false;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const renderSubItems = (item: NavItem, mobile = false) => {
    if (!item.subItems) {
      return null;
    }

    return (
      <div
        className={`${
          mobile ? "mt-2 space-y-1 pl-4" : "absolute left-0 top-full mt-3 w-56"
        } rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900`}
      >
        {item.subItems.map((subItem) => (
          <Link
            key={subItem.name}
            href={subItem.path}
            onClick={() => mobile && setApplicationMenuOpen(false)}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive(subItem.path)
                ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
            }`}
          >
            <span className="flex items-center justify-between gap-3">
              <span>{subItem.name}</span>
              <span className="flex items-center gap-1">
                {subItem.new ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-500 dark:bg-brand-500/20 dark:text-brand-400">
                    new
                  </span>
                ) : null}
                {subItem.pro ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-500 dark:bg-brand-500/20 dark:text-brand-400">
                    pro
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        ))}
      </div>
    );
  };

  const renderDesktopItem = (item: NavItem) => {
    const active = isItemActive(item);

    if (!item.subItems) {
      return (
        <Link
          key={item.name}
          href={item.path ?? "/"}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            active
              ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
          }`}
        >
          <span className={active ? "text-brand-500 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}>
            {item.icon}
          </span>
          <span>{item.name}</span>
        </Link>
      );
    }

    const open = activeMenu === item.name || active;

    return (
      <div key={item.name} className="relative">
        <button
          type="button"
          onClick={() =>
            setActiveMenu((current) => (current === item.name ? null : item.name))
          }
          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            open
              ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
          }`}
        >
          <span className={open ? "text-brand-500 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}>
            {item.icon}
          </span>
          <span>{item.name}</span>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${open ? "rotate-180 text-brand-500 dark:text-brand-400" : "text-gray-400"}`}
          />
        </button>
        {open ? renderSubItems(item) : null}
      </div>
    );
  };

  const renderMobileItem = (item: NavItem) => {
    const active = isItemActive(item);

    if (!item.subItems) {
      return (
        <Link
          key={item.name}
          href={item.path ?? "/"}
          onClick={() => setApplicationMenuOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
            active
              ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <span className={active ? "text-brand-500 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}>
            {item.icon}
          </span>
          <span>{item.name}</span>
        </Link>
      );
    }

    const open = activeMenu === item.name || active;

    return (
      <div key={item.name} className="rounded-xl border border-gray-200 p-2 dark:border-gray-800">
        <button
          type="button"
          onClick={() =>
            setActiveMenu((current) => (current === item.name ? null : item.name))
          }
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors ${
            open
              ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <span className={open ? "text-brand-500 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}>
            {item.icon}
          </span>
          <span>{item.name}</span>
          <ChevronDownIcon
            className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180 text-brand-500 dark:text-brand-400" : "text-gray-400"}`}
          />
        </button>
        {open ? renderSubItems(item, true) : null}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-99999 w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="relative mx-auto flex w-full max-w-(--breakpoint-2xl) flex-col px-3 lg:px-6">
        <div className="flex items-center justify-between gap-3 py-3 lg:py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="lg:hidden">
              <Image
                width={154}
                height={32}
                className="dark:hidden"
                src="./images/logo/logo.svg"
                alt="Logo"
              />
              <Image
                width={154}
                height={32}
                className="hidden dark:block"
                src="./images/logo/logo-dark.svg"
                alt="Logo"
              />
            </Link>

            <Link href="/" className="hidden lg:block">
              <Image
                width={154}
                height={32}
                className="dark:hidden"
                src="./images/logo/logo.svg"
                alt="Logo"
              />
              <Image
                width={154}
                height={32}
                className="hidden dark:block"
                src="./images/logo/logo-dark.svg"
                alt="Logo"
              />
            </Link>
            <p className="mt-1 font-normal text-gray-500 text-theme-sm dark:text-gray-400">
              Fraud Analysis & Immutable Data System
            </p>

            <button
              type="button"
              onClick={() => setApplicationMenuOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>

          <div className="hidden flex-1 items-center justify-center gap-2 lg:flex xl:justify-end xl:pl-4">
            {navigationItems.map((item) => renderDesktopItem(item))}
          </div>

          <div className="hidden items-center gap-3 xl:flex">
            <ThemeToggleButton />
            <NotificationDropdown />
            <UserDropdown />
          </div>
        </div>

        <div
          className={`overflow-hidden border-t border-gray-200 transition-all duration-300 dark:border-gray-800 lg:hidden ${
            isApplicationMenuOpen ? "max-h-[75vh] py-4" : "max-h-0 py-0"
          }`}
        >
          <div className="space-y-4">
            <div className="space-y-3">
              {navigationItems.map((item) => renderMobileItem(item))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <ThemeToggleButton />
              <NotificationDropdown />
              <UserDropdown />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;