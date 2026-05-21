import { Suspense } from "react";
import TransactionTable from "@/components/tables/TransactionTable";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transactions | Fraud Analysis System",
  description: "Review and manage fraud transactions",
};

export default function TransactionsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Transactions" />
      <div className="space-y-4 mt-6">
        <Suspense>
          <TransactionTable />
        </Suspense>
      </div>
    </div>
  );
}
