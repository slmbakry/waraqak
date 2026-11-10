"use client";
import Only from "@/components/Only";
import MyServices from "@/components/office/MyServices";
export default function Page() { return <Only roles={["office"]}><MyServices /></Only>; }
