"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";

import Badge from "../ui/badge/Badge";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { MoreDotIcon } from "@/icons";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { useDropdown } from "@/hooks/useDropdown";

interface Order {
  id: number;
  date: string;
  name: string;
  cardNumber: string;
  address: string;
  amount: number;
  risk: string;
  status: string;
}

// Define the table data using the interface
const tableData: Order[] = [
  {
    id: 1,
    date: "2026-03-25",
    name: "Samuel Hang",
    cardNumber: "1234-1234-1234-1234",
    address: "Subang Jaya, Selangor",
    amount: 2399.00,
    risk: "High",
    status: "Pending"
  },
  {
    id: 2,
    date: "2026-03-25",
    name: "Mun Long",
    cardNumber: "5678-5678-5678-5678",
    address: "Georgetown, Penang",
    amount: 879.00,
    risk: "Medium",
    status: "In Review"
  },
  {
    id: 3,
    date: "2026-03-24",
    name: "Chan Ching",
    cardNumber: "9012-9012-9012-9012",
    address: "Puchong, Selangor",
    amount: 1869.00,
    risk: "Low",
    status: "Resolved"
  },
  {
    id: 4,
    date: "2026-03-23",
    name: "Bobby Harper",
    cardNumber: "3456-3456-3456-3456",
    address: "Kuala Lumpur, Wilayah Persekutuan",
    amount: 1699.00,
    risk: "High",
    status: "Resolved"
  },
  {
    id: 5,
    date: "2026-03-21",
    name: "Randy Parker",
    cardNumber: "7890-7890-7890-7890",
    address: "Setia Alam, Selangor",
    amount: 240.00,
    risk: "Medium",
    status: "In Review"
  }
];

export default function BasicTableOne() {
  const { openId, toggleDropdown, closeDropdown } = useDropdown();

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1102px]">
          <Table>
            {/* Table Header */}
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  ID
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Date
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Name
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Card Number
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Address
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Amount
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Risk
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Status
                </TableCell>
              </TableRow>
            </TableHeader>

            {/* Table Body */}
            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {tableData.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.id}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.date}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.cardNumber}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.address}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.amount.toLocaleString("en-MY", { style: "currency", currency: "MYR" })}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {order.risk}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <Badge
                      size="sm"
                      color={
                        order.status === "Resolved"
                          ? "success"
                          : order.status === "In Review"
                          ? "warning"
                          : "error"
                      }
                    >
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => toggleDropdown(order.id)}
                        className="dropdown-toggle"
                      >
                        <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                      </button>
                      <Dropdown
                        isOpen={openId === order.id}
                        onClose={closeDropdown}
                        className="w-40 p-2"
                      >
                        <DropdownItem
                          tag="a"
                          onItemClick={closeDropdown}
                          className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                        >
                          Review
                        </DropdownItem>
                        <DropdownItem
                          tag="a"
                          onItemClick={closeDropdown}
                          className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                        >
                          Assign
                        </DropdownItem>
                      </Dropdown>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
