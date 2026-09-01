import { OrderDetailView } from "@/components/OrderDetailView";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return { title: `${number} — Freitty` };
}

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <OrderDetailView number={number} />;
}
