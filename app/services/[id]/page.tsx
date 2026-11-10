"use client";
import { useParams } from "next/navigation";
import Only from "@/components/Only";
import { QuoteStart } from "@/components/owner/Quote";
export default function Page() { const { id } = useParams<{ id: string }>(); return <Only roles={["owner"]}><QuoteStart serviceId={id} /></Only>; }
