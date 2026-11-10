"use client";
// The owner's own details. The phone is optional and stays hidden from a provider until a
// request between them is accepted, and then only shows when the provider asks for it.
import { sb } from "@/lib/supabase";
import { useLoad, useSession } from "./session";
import { Head, LoadError, Loading } from "./ui";

export default function Account() {
  const { uid, profile, toast } = useSession();
  const { data, error, reload } = useLoad(async () => (await sb.from("owner_contacts").select("phone").eq("user_id", uid).maybeSingle()).data?.phone || "", [uid]);
  if (error) return <LoadError />;
  if (data === undefined) return <Loading />;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const phone = String(new FormData(e.currentTarget).get("phone") || "").trim() || null;
    const { error } = await sb.from("owner_contacts").upsert({ user_id: uid, phone });
    if (error) return toast("تعذّر حفظ الرقم", true);
    toast("تم حفظ بياناتك"); reload();
  };
  return (
    <>
      <Head eyebrow="حسابي" title="بياناتك"><p>بريدك الإلكتروني للدخول فقط، ولا يظهر لأي مقدم خدمة.</p></Head>
      <form className="panel quiz" onSubmit={save}>
        <div className="kv"><span>البريد الإلكتروني</span><b className="ltr">{profile.email}</b></div>
        <div className="field"><label htmlFor="ac-phone">رقم الهاتف (اختياري)</label>
          <input id="ac-phone" name="phone" className="ltr" inputMode="tel" maxLength={30} defaultValue={data} />
          <small className="note">لا يراه مقدم الخدمة إلا بعد أن تتفقا على طلب، وإذا طلبه. قبل ذلك يكون التواصل من الرسائل داخل الطلب.</small></div>
        <button className="btn primary" type="submit">حفظ</button>
      </form>
    </>
  );
}
