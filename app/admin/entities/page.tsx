"use client";
import Only from "@/components/Only";
import EntityChooser from "@/components/admin/EntityChooser";
// Admin-only until its content passes the lawyer's review; then it moves into the founding guide.
export default function Page() { return <Only roles={["admin"]}><EntityChooser /></Only>; }
