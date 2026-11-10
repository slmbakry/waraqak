"use client";
import Only from "@/components/Only";
import Catalog from "@/components/admin/Catalog";
export default function Page() { return <Only roles={["admin"]}><Catalog /></Only>; }
