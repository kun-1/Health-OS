import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ month?: string | string[] }>;
};

export default async function ExpensesReceiptsPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const suffix = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? `?month=${encodeURIComponent(rawMonth)}` : "";
  redirect(`/expenses/transactions${suffix}`);
}
