// Shared reads and rules: services, document status, who can do a service, stage lateness.
import { sb } from "./supabase";
import { DAY, num, today } from "./format";

const REMINDER_BUFFER_DAYS = 14;

// A question a service asks before providers can price it.
export type NeedField = { id: string; label: string; type: "text" | "number" | "select" | "date"; options?: string[]; required?: boolean };
// A service is either a procedure with a published price, or a request for offers ("quote").
export type Service = { id: string; title: string; kind: string; agency: string; gov_fee: number; self_days: number; validity_days: number | null; docs: string[]; place_kind: import("./places").PlaceKind;
  category_id: string; mode: "procedure" | "quote"; need_fields: NeedField[]; summary: string | null };
export type Category = { id: string; title: string; summary: string | null; icon: string; sort: number; active: boolean };
export type Services = Record<string, Service>;
export type Stage = { id?: string; idx: number; title: string; planned_days: number; started_at: string | null; done_at: string | null };
export type Option = { key: string; officeId: string | null; label: string; sub?: string; fee: number; cost: number; days: number;
  pro?: number | null; speed?: number | null; count?: number; done?: number; onTime?: number };

let cache: Services | null = null;
export async function services(): Promise<Services> {
  if (!cache) {
    const { data, error } = await sb.from("services").select("*").eq("active", true).order("sort");
    if (error) throw error;
    cache = Object.fromEntries(data.map((s) => [s.id, s]));
  }
  return cache;
}

let catCache: Category[] | null = null;
export async function categories(): Promise<Category[]> {
  if (!catCache) {
    const { data, error } = await sb.from("categories").select("*").eq("active", true).order("sort");
    if (error) throw error;
    catCache = data as Category[];
  }
  return catCache;
}
export const forgetCatalog = () => { cache = null; catCache = null; };

// A request for offers has nobody carrying it out until the owner accepts one.
type Doer = { office_id?: string | null; mode?: string | null; offices?: any };
export const awaitingOffers = (r: Doer) => r.mode === "quote" && !r.office_id;
export const doerName = (r: Doer) => (r.office_id ? r.offices?.name || "" : awaitingOffers(r) ? "بانتظار العروض" : "تنفذه بنفسك");

// How a document stands today: ok, renew soon, or expired.
export function docStatus(doc: { expires_on: string | null }, svc?: Service) {
  if (!doc.expires_on) return { cls: "ok", label: "بلا تاريخ انتهاء", left: null as number | null, startOn: null as Date | null };
  const exp = new Date(doc.expires_on); exp.setHours(0, 0, 0, 0);
  const left = Math.round((exp.getTime() - today().getTime()) / DAY);
  const lead = (svc?.self_days || 7) + REMINDER_BUFFER_DAYS;
  const startOn = new Date(exp.getTime() - lead * DAY);
  if (left < 0) return { cls: "bad", label: "منتهي", left, startOn };
  if (today() >= startOn) return { cls: "warn", label: "ابدأ التجديد", left, startOn };
  return { cls: "ok", label: "ساري", left, startOn };
}

// Offices that offer a service, with their price, time and average ratings.
// Demo offices only show while an admin is previewing.
export async function optionsFor(serviceId: string, preview: boolean): Promise<Option[]> {
  const svc = (await services())[serviceId];
  const [{ data: rows }, { data: ratings }, { data: perf }] = await Promise.all([
    sb.from("office_services").select("fee,days,offices(id,name,active,is_demo)").eq("service_id", serviceId),
    sb.from("ratings").select("office_id,professionalism,speed"),
    sb.rpc("office_stats"),
  ]);
  const perfOf = Object.fromEntries((perf || []).map((p: any) => [p.office_id, p]));
  const stats: Record<string, { pro: number; speed: number; n: number }> = {};
  (ratings || []).forEach((r) => {
    const s = (stats[r.office_id] ||= { pro: 0, speed: 0, n: 0 });
    s.pro += r.professionalism; s.speed += r.speed; s.n++;
  });
  const offices = (rows || []).map((r: any) => r).filter((r) => r.offices?.active && (!r.offices.is_demo || preview)).map((r) => {
    const s = stats[r.offices.id];
    return { key: r.offices.id, officeId: r.offices.id, label: r.offices.name, fee: Number(r.fee), cost: Number(r.fee) + Number(svc.gov_fee), days: r.days,
      pro: s ? s.pro / s.n : null, speed: s ? s.speed / s.n : null, count: s ? s.n : 0,
      done: perfOf[r.offices.id]?.done || 0, onTime: perfOf[r.offices.id]?.on_time || 0 } as Option;
  }).sort((a, b) => (b.pro ?? 0) - (a.pro ?? 0));
  return [{ key: "self", officeId: null, label: "سأنفذها بنفسي", sub: "من البوابة الإلكترونية أو بالتقديم بنفسك", fee: 0, cost: Number(svc.gov_fee), days: svc.self_days }, ...offices];
}

// Ratings come from owners; the on-time share comes from the requests' own dates.
export function optionLabel(o: Option) {
  if (!o.officeId) return o.sub;
  const parts = [o.count ? `احترافية ${num(o.pro.toFixed(1))} · سرعة ${num(o.speed.toFixed(1))} · ${num(o.count)} تقييم` : "لا توجد تقييمات بعد"];
  if (o.done) parts.push(`التزم بالموعد في ${num(Math.round((o.onTime / o.done) * 100))}٪ من ${num(o.done)} طلب`);
  return parts.join(" · ");
}

// A stage is late when it started and its planned days have passed.
export function stageLate(stage?: Stage | null) {
  if (!stage?.started_at || stage.done_at) return 0;
  const due = new Date(stage.started_at).getTime() + stage.planned_days * DAY;
  return Math.max(0, Math.floor((Date.now() - due) / DAY));
}

export const sortStages = <T extends Stage>(st?: T[] | null) => (st || []).slice().sort((a, b) => a.idx - b.idx);

export const EVENTS: Record<string, string> = { rated: "قيّم صاحب العمل مقدم الخدمة", created: "تم إنشاء الطلب", accepted: "قبل مقدم الخدمة الطلب", declined: "اعتذر مقدم الخدمة عن الطلب",
  stage_done: "اكتملت مرحلة", done: "اكتمل الطلب", cancelled: "أُلغي الطلب", note: "ملاحظة", file: "رُفع ملف" };
// On a request for offers it is the owner who accepts, so the entry reads differently.
export const eventLabel = (kind: string, mode?: string | null) => (kind === "accepted" && mode === "quote" ? "قُبل العرض وتم الاتفاق" : EVENTS[kind] || kind);
export const OFFER_STATUS: Record<string, [string, string]> = { sent: ["warn", "بانتظار رد صاحب العمل"], accepted: ["ok", "مقبول"], declined: ["", "اختير عرض آخر"], withdrawn: ["", "مسحوب"] };
export const STATUS: Record<string, [string, string]> = { new: ["", "جديد"], accepted: ["", "تم القبول"], in_progress: ["warn", "قيد التنفيذ"], done: ["ok", "تم"], cancelled: ["", "ملغي"] };
