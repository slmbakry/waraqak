"use client";
import Only from "@/components/Only";
import Accuracy from "@/components/admin/Accuracy";
export default function Page() { return <Only roles={["admin"]}><Accuracy /></Only>; }
