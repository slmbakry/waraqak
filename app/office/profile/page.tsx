"use client";
import Only from "@/components/Only";
import MyProfile from "@/components/office/MyProfile";
export default function Page() { return <Only roles={["office"]}><MyProfile /></Only>; }
