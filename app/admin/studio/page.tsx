"use client";
import Only from "@/components/Only";
import { Studio } from "@/components/admin/Studio";
export default function Page() { return <Only roles={["admin"]}><Studio /></Only>; }
