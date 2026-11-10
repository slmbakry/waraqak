"use client";
import Only from "@/components/Only";
import Account from "@/components/Account";
export default function Page() { return <Only roles={["owner"]}><Account /></Only>; }
