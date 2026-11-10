"use client";
// The provider runs its own shop window: which sections it works in, and its price and time
// for each procedure. Changes are live at once; requests for offers are priced one by one.
import { sb } from "@/lib/supabase";
import { money } from "@/lib/format";
import { categories, services } from "@/lib/data";
import { useLoad, useSession } from "../session";
import { Head, Icon, LoadError, Loading } from "../ui";

export default function MyServices() {
  const { officeId, toast, profile } = useSession();
  const { data, error, reload } = useLoad(async () => {
    if (!officeId) return null;
    const [cats, svcs, { data: office }, { data: oc }, { data: rows }] = await Promise.all([
      categories(), services(),
      sb.from("offices").select("id,name").eq("id", officeId).maybeSingle(),
      sb.from("office_categories").select("category_id").eq("office_id", officeId),
      sb.from("office_services").select("service_id,fee,days").eq("office_id", officeId),
    ]);
    return { cats, svcs: Object.values(svcs), office, mine: new Set((oc || []).map((x) => x.category_id as string)), cur: Object.fromEntries((rows || []).map((r) => [r.service_id, r])) };
  }, [officeId]);
  if (!officeId) return <section className="panel"><p>{profile.role === "admin" ? "اختر مقدم الخدمة الذي تريد التجربة به من الشريط في الأعلى." : "حسابك غير مرتبط بمقدم خدمة بعد. تواصل مع مدير المنصة."}</p></section>;
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { cats, svcs, office, mine, cur } = data;

  const toggle = async (id: string, on: boolean) => {
    const { error } = on ? await sb.from("office_categories").insert({ office_id: officeId, category_id: id })
      : await sb.from("office_categories").delete().eq("office_id", officeId).eq("category_id", id);
    if (error) return toast("تعذّر حفظ القسم", true);
    toast(on ? "أضفنا القسم إلى خدماتك" : "أزلنا القسم من خدماتك"); reload();
  };
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const upserts = [], drops: string[] = [];
    for (const s of svcs.filter((x) => x.mode === "procedure" && mine.has(x.category_id))) {
      const fee = String(f.get("fee-" + s.id) ?? ""), d = String(f.get("days-" + s.id) ?? "");
      if (fee !== "" && d !== "") upserts.push({ office_id: officeId, service_id: s.id, fee: Number(fee), days: Number(d) });
      else if (cur[s.id]) drops.push(s.id);
    }
    const a = upserts.length ? await sb.from("office_services").upsert(upserts) : { error: null };
    const b = drops.length ? await sb.from("office_services").delete().eq("office_id", officeId).in("service_id", drops) : { error: null };
    if (a.error || b.error) return toast("تعذّر حفظ الأسعار", true);
    toast("تم حفظ أسعارك، وهي ظاهرة الآن لأصحاب الأعمال"); reload();
  };
  const chosen = cats.filter((c) => mine.has(c.id));

  return (
    <>
      <Head eyebrow={office?.name || "مقدم الخدمة"} title="خدماتي وأسعاري">
        <p>اختر الأقسام التي تعمل فيها، واكتب أتعابك ومدتك لكل خدمة. ما تحفظه يظهر لأصحاب الأعمال فورًا.</p>
      </Head>
      <section className="panel"><h2>الأقسام التي أعمل فيها</h2>
        <div className="opts">{cats.map((c) => (
          <label key={c.id} className="opt"><input type="checkbox" checked={mine.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
            <span className="tile-ic"><Icon name={c.icon} /></span><span><b>{c.title}</b><small>{c.summary || ""}</small></span></label>
        ))}</div>
        <small className="note">طلبات عروض الأسعار في القسم تصلك بعد أن تختاره.</small>
      </section>
      {chosen.length ? (
        <form className="stack" onSubmit={save}>
          {chosen.map((c) => {
            const list = svcs.filter((s) => s.category_id === c.id);
            if (!list.length) return null;
            return (
              <section key={c.id} className="panel"><h2>{c.title}</h2>
                <div className="table-wrap"><table><thead><tr><th>الخدمة</th><th>الرسوم الحكومية</th><th>أتعابك بالجنيه</th><th>مدتك بالأيام</th></tr></thead><tbody>
                  {list.map((s) => s.mode === "quote" ? (
                    <tr key={s.id}><td>{s.title}</td><td colSpan={3}><span className="chip warn">تُسعَّر بعرض لكل طلب</span></td></tr>
                  ) : (
                    <tr key={s.id}><td>{s.title}</td><td>{money(s.gov_fee)}</td>
                      <td><input className="mini" type="number" min="0" step="50" name={`fee-${s.id}`} defaultValue={cur[s.id]?.fee ?? ""} aria-label={`أتعاب ${s.title}`} /></td>
                      <td><input className="mini" type="number" min="1" step="1" name={`days-${s.id}`} defaultValue={cur[s.id]?.days ?? ""} aria-label={`مدة ${s.title}`} /></td></tr>
                  ))}
                </tbody></table></div>
              </section>
            );
          })}
          <section className="panel"><p className="note">الخدمة التي تترك سعرها أو مدتها فارغة لا تظهر باسمك. الرسوم الحكومية تُضاف تلقائيًا إلى ما يراه صاحب العمل.</p>
            <button className="btn primary" type="submit">حفظ الأسعار</button></section>
        </form>
      ) : <section className="panel"><p className="empty">اختر قسمًا واحدًا على الأقل لتظهر خدماته هنا.</p></section>}
    </>
  );
}
