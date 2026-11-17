// Choosing a legal form: the forms, a few questions, and which forms each answer
// rules out, with the reason in words. A DRAFT for the lawyer's review: until it is
// reviewed the screen that uses it (/admin/entities) is shown to admins only.
//
// The screen never recommends a form. It shows which forms remain open given the
// answers ("المتاح حسب إجاباتك") and dims the rest with the reason. No figures
// (minimum capital, fees) are stated here on purpose: they wait for confirmation.

export type Family = "individual" | "persons" | "capital";
export const FAMILIES: [Family, string][] = [["individual", "فردي"], ["persons", "شركات أشخاص"], ["capital", "شركات أموال"]];

export type Entity = {
  id: string;
  name: string;
  family: Family;
  // One short line each, as the comparison table shows them.
  founders: string;
  liability: string;
  ownership: string;
  note: string;
};

export const ENTITIES: Entity[] = [
  { id: "sole", name: "منشأة فردية", family: "individual",
    founders: "شخص واحد", liability: "يُسأل صاحبها عن ديونها بأمواله الخاصة", ownership: "لا حصص ولا أسهم",
    note: "الأبسط في الإجراءات، والمنشأة وصاحبها ذمة مالية واحدة." },
  { id: "general", name: "شركة تضامن", family: "persons",
    founders: "شريكان أو أكثر", liability: "كل شريك يُسأل عن ديون الشركة بأمواله الخاصة", ownership: "حصص لا تنتقل عادة إلا بموافقة الشركاء",
    note: "تقوم على الثقة الشخصية بين الشركاء." },
  { id: "limited", name: "شركة توصية بسيطة", family: "persons",
    founders: "شريكان أو أكثر", liability: "شريك متضامن على الأقل يُسأل بأمواله الخاصة، والشريك الموصي في حدود حصته", ownership: "حصص لا تنتقل عادة إلا بموافقة الشركاء",
    note: "تجمع شريكًا يدير ويتحمل، وشريكًا يمول ويتحمل في حدود حصته." },
  { id: "opc", name: "شركة الشخص الواحد", family: "capital",
    founders: "شخص واحد", liability: "في حدود رأس مال الشركة", ownership: "يملكها شخص واحد بالكامل",
    note: "تفصل أموالك الخاصة عن أموال الشركة وأنت مالكها الوحيد." },
  { id: "llc", name: "شركة ذات مسئولية محدودة", family: "capital",
    founders: "شريكان أو أكثر، بحد أقصى يحدده القانون", liability: "كل شريك في حدود حصته", ownership: "حصص، ونقلها لغير الشركاء له قيود",
    note: "الشكل الشائع للشركات الصغيرة والمتوسطة ذات الشركاء." },
  { id: "jsc", name: "شركة مساهمة", family: "capital",
    founders: "عدد أدنى من المؤسسين يحدده القانون", liability: "كل مساهم في حدود قيمة أسهمه", ownership: "أسهم قابلة للتداول",
    note: "تناسب دخول مستثمرين كثيرين أو طرح أسهم." },
  { id: "pls", name: "شركة توصية بالأسهم", family: "capital",
    founders: "شريك متضامن أو أكثر، ومساهمون", liability: "الشريك المتضامن بأمواله الخاصة، والمساهم في حدود أسهمه", ownership: "أسهم للمساهمين",
    note: "تجمع شريكًا متضامنًا يدير، ومساهمين يملكون أسهمًا." },
];

export type Question = {
  id: string;
  q: string;
  help: string;
  options: { id: string; label: string; rulesOut: Record<string, string> }[];
};

// Each option lists the forms it rules out and, for each, the reason shown on the dimmed card.
// "Not sure" rules out nothing. Every reason here is a draft for review.
const MANY = "هذا الشكل يحتاج أكثر من شخص واحد.";
const ONE = "هذا الشكل لشخص واحد فقط.";
const OWN = "صاحبها يُسأل عن ديونها بأمواله الخاصة.";
const ALL = "كل الشركاء يُسألون عن الديون بأموالهم الخاصة.";
const SOME = "يلزم فيه شريك متضامن واحد على الأقل يُسأل بأمواله الخاصة.";
const SHARES = "هذا الشكل لا يصدر أسهمًا.";

export const QUESTIONS: Question[] = [
  { id: "founders", q: "كم عدد من سيملكون المشروع؟", help: "الملاك عند البداية، وليس الموظفين.",
    options: [
      { id: "one", label: "أنا وحدي", rulesOut: { general: MANY, limited: MANY, llc: MANY, jsc: MANY, pls: MANY } },
      { id: "many", label: "اثنان أو أكثر", rulesOut: { sole: ONE, opc: ONE } },
      { id: "unsure", label: "لم أحدد بعد", rulesOut: {} },
    ] },
  { id: "liability", q: "هل تريد ألا يُسأل أي مالك عن ديون المشروع بأمواله الخاصة؟", help: "أي أن تقف مسؤولية كل مالك عند ما وضعه في المشروع.",
    options: [
      { id: "all", label: "نعم، لكل الملاك", rulesOut: { sole: OWN, general: ALL, limited: SOME, pls: SOME } },
      { id: "any", label: "لا يشترط ذلك", rulesOut: {} },
      { id: "unsure", label: "لست متأكدًا", rulesOut: {} },
    ] },
  { id: "shares", q: "هل تنوي إصدار أسهم لمستثمرين كثيرين أو طرحها للتداول؟", help: "غير دخول شريك أو اثنين فيما بعد.",
    options: [
      { id: "yes", label: "نعم", rulesOut: { sole: SHARES, general: SHARES, limited: SHARES, opc: SHARES, llc: SHARES } },
      { id: "no", label: "لا", rulesOut: {} },
      { id: "unsure", label: "لم أحدد بعد", rulesOut: {} },
    ] },
];

// What the questions do not cover yet, said plainly under the map.
export const NOT_COVERED = [
  "الحد الأدنى لرأس المال لكل شكل.",
  "الأنشطة التي يشترط القانون لها شكلًا معينًا أو رأس مال معينًا.",
  "وجود شريك غير مصري.",
  "الضرائب والتكاليف السنوية لكل شكل.",
];

export type Answers = Record<string, string | undefined>;

// For each form: null if it remains open, or the question and reason that ruled it out.
export function ruledOut(a: Answers): Record<string, { question: string; reason: string } | null> {
  const out: Record<string, { question: string; reason: string } | null> = Object.fromEntries(ENTITIES.map((e) => [e.id, null]));
  QUESTIONS.forEach((q) => {
    const opt = q.options.find((o) => o.id === a[q.id]);
    if (!opt) return;
    Object.entries(opt.rulesOut).forEach(([id, reason]) => { if (!out[id]) out[id] = { question: q.q, reason }; });
  });
  return out;
}
