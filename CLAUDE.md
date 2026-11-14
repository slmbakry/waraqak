# Waraqak (ورقك): notes for Claude

Read this before working on the project. It records where everything lives, the decisions
already made with the owner, and what is still open, so a new chat does not need it all
explained again. Keep it current: when you finish something or a decision changes, edit
this file in the same commit.

## Talking to the owner

- Reply in Egyptian Arabic. Text shown on the site is plain Modern Standard Arabic.
- Never mix Arabic and English in one line or sentence: it breaks text direction. Put an
  English term, product name, setting or code on its own line, in a code box or its own
  table cell. Numbers are fine inside Arabic lines.
- Before substantial work, say in a few lines what you understood and the approach, and
  wait for a go-ahead. Show the design or outline before building. Ask short questions
  rather than assume.
- The owner does not read code. Report outcomes, what was tested and what was not, and
  what you need from them.
- Never put an API key or password in code or chat. The owner enters secrets themselves.
- Real company documents (IDs, tax cards, registers) are never committed or uploaded.

## What the product is

A platform for Egyptian businesses: everything a company must do over its life
(founding, amendments, renewals, recurring filings, licensed activities, closure), what
each step needs and costs, and providers who carry it out, with tracking and reminders.
Built on two foundations the owner insists on: legal facts that are accurate and sourced,
and an experience easy for both business owners and providers. It must grow to new
service lines (insurance and others) without new code.

Before launch the public sees only a "coming soon" page; the idea must not show. Sign-in
is by invitation, behind a small "دخول المدعوين" link.

## Where things live

| Part | Where |
|---|---|
| Code | GitHub `slmbakry/waraqak` (old name `slmbakry/rasmy` redirects), branch `main` |
| Hosting | Vercel project `prj_8BZ0LoA2dJFQxN8wROYeXzCCOS2Y`, team `team_C1AmtyQC8L9aZatRHH60ZE22` |
| Deploys | Every push to `main` deploys to production automatically |
| Domain | `waraqak.com` (and `www.waraqak.com` redirecting to it), also `waraqak.vercel.app` |
| DNS | Cloudflare nameservers; the domain is registered outside Vercel |
| Database, sign-in, files | Supabase project `ewbpshqntggizomdejys` (Postgres, Auth, Storage bucket `files`) |
| Server function | Supabase Edge Function `share` (`supabase/functions/share`), public, reads share links |
| Scheduled jobs | `pg_cron`: `rasmy-check` hourly (lateness, escalation, renewals), `obligation-reminders` daily |
| Document reader | `lib/reader.ts` loads OCR assets from `slmbakry.github.io/doc-reader` |
| Social accounts | facebook.com/waraqak, instagram.com/waraqak, tiktok.com/@waraqakeg, linkedin.com/company/waraqak |

The Supabase URL and publishable key are in `lib/supabase.ts`; they are meant for browsers
and every read and write is enforced by Row Level Security.

## Stack

Next.js 15 App Router, React 19, TypeScript, plain CSS in `app/globals.css`. Every page is
a client component; data comes straight from Supabase with RLS. No server API of our own
except the `share` Edge Function.

Checks before every push: `npx tsc --noEmit` and `npx next build`.

## Database changes

- Each change is a file in `supabase/migrations/` named `YYYYMMDDHHMMSS_name.sql`, in order.
  Apply it to the live project (the Supabase connector's apply-migration tool) and commit
  the same file. Never edit an applied migration; add a new one.
- Prefer additive changes. Statements that drop or delete trigger a confirmation the owner
  can miss; warn first, or write them as `alter policy` and similar where possible.
- After a schema change, test the rules in SQL by impersonating users:
  `set_config('request.jwt.claims', ...)` then `set local role authenticated`, inside a
  `do` block that ends by raising its results so nothing is kept.

## Roles and rules that live in the database

Roles: `owner` (business owner), `office` (service provider), `admin`. An admin can preview
as the other two from a bar at the top; data made in preview is marked `is_demo`.

Rules enforced by triggers and policies, not only by screens:
- A request's price and time come from the provider's published offer (`guard_request_insert`).
- Each side makes only its own move: the owner cancels, the provider accepts or declines;
  other request fields are locked (`guard_request_update`).
- Stages finish in order, by whoever carries the request out, on the server's clock; the
  provider must upload a file before closing the last stage (`guard_stage_update`).
- A provider extends a stage only through `extend_stage(stage, days, reason)`; on-time
  figures still use the original promise.
- Contact details are revealed as late as possible: a provider's phone (`office_contacts`)
  and an owner's phone (`owner_contacts`) are readable by the other side only after a
  request between them is accepted, and screens show them only behind a button. An owner's
  email is never shown to providers.
- A provider edits only its own `about` and `areas`; name, licence and `verified` are admin's.

## How services are modelled

- `categories`: sections, managed from `/admin/catalog`; new ones are added hidden.
- `services`: each has a `category_id` and a `mode`:
  - `procedure`: stages and documents with a published price per provider (`office_services`).
  - `quote`: the owner answers `need_fields`, providers in the section send `offers`, the
    owner accepts one with `accept_offer()`, and an `agreements` row fixes the terms.
    A service with `validity_days` becomes a dated document when done.
- Accuracy fields on each service: `sources`, `confidence` (confirmed, likely,
  unverified), `reviewed_at`, `review_note`, `fee_note`, `fee_parts` (drives the fee
  calculator). Every change to these is logged in `service_changes`.
- `reports`: error reports from any user on a service, path, activity or obligation;
  answered from `/admin/accuracy`.
- Paths (amendments, closure) and licensed activities live in code: `lib/paths.ts` and
  `lib/activities.ts`, each with sources and an "unsure" list. The registry activity guide
  is `lib/registry.ts` (68 entries from ISIC, not yet from the official portal).

## Map of the code

| Area | Files |
|---|---|
| Shell, menus, loading | `components/Shell.tsx`, `components/ui.tsx` (icons, Loading, shared blocks) |
| Coming-soon page and sign-in | `components/auth.tsx` |
| Owner | `components/owner/*`: Home, Catalog (new service), Quote (offers), Request, Sections (obligations, requests), Files, Shares, Guide, PathView, Activities, Registry |
| Provider | `components/office/*`: Office (requests, job), QuoteJob, MyServices, MyProfile, ProviderRequirements |
| Admin | `components/admin/*`: Admin (home, performance, invites, providers, prices, users, companies, feedback), Catalog, Accuracy |
| Shared | `Thread.tsx` (messages), `Dispute.tsx`, `Trust.tsx` (sources and error reports), `FeeCalc.tsx`, `Provider.tsx`, `Social.tsx`, `Requirements.tsx` |
| Data helpers | `lib/data.ts` (services, categories, statuses), `lib/format.ts`, `lib/obligations.ts`, `lib/files.ts` |

## Design

"Official paper, modern hand": warm paper background, dark ink text, green only as the
stamp (status, confirmation, main action), a thin gold line for what is special. The logo's
folded corner and ring recur: the company card, document cards, status chips as stamps.
Loading is the logo's green ring drawing itself, then the page appearing inside.
Fonts: Alexandria for headings, IBM Plex Sans Arabic for text. One icon per meaning, drawn
in `components/ui.tsx`. Colours are tokens at the top of the "Look v3" block in
`app/globals.css`, with a dark mode. Check every screen at phone width (390px) too.

## Testing in a browser

There is a temporary admin account `mobile-review-temp@waraqak.com` (user id
`0b2a118c-de9f-407d-9dda-8ca69cc88292`) with a demo company. It is kept disabled between
uses (no role, no password, banned). To use it: set a fresh random password and unban it
in SQL, give it role `admin`, sign in with Playwright at phone and desktop sizes, then
disable it again. The owner asked to keep it until the work is finished, then delete it
and its data with one confirmation.

The cloud environment's network allows Supabase and Google Fonts; other sites may be
blocked, and the owner has declined adding more hosts.

## Status (14 November 2026)

Done and live: coming-soon page, new design across all pages, request rules locked in the
database, sections and offers and agreements, accuracy layer and error reports, messages
and missing-document requests, provider profile, delayed contact details, complaints,
stage extensions, delivery proof, fee calculator for incorporation, social links.

Service facts: 43 services "likely" (from published sources), 7 "unverified". None is
"confirmed" from the authority itself. Incorporation fees: only two parts are fixed by the
Companies Law (art. 17); the bar association, chamber of commerce, register and name
certificate amounts are not confirmed.

## Open

1. Registry activity guide from the official portal `bor.itda.gov.eg`. Its certificate
   expired in June 2026 and it may open only from inside Egypt, so it cannot be reached
   from the cloud. Plan: the owner opens `https://bor.itda.gov.eg/ActivityGuide`, searches,
   and sends a screenshot and the saved page; then decide how to extract the full list.
   The owner calls this the most important open item.
2. Generator for general-assembly minutes and contracts: interactive editor exporting Word
   and PDF. Show the design first.
3. The 7 unverified services, and the unconfirmed fee parts.
4. Postponed by the owner: email reminders (needs Resend and Supabase SMTP set up),
   self sign-up for companies and providers, payments.
5. When everything is finished: delete the temporary test account and its data.
