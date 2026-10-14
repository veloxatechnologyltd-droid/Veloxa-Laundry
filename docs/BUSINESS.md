# Business context

## Brand

- Product: **Veloxa Laundry Management**, "a subsidiary of Veloxa Technology Ltd".
- The old working name "WashPoint" must not appear in anything customer-facing.
- Founder story (the sales moat): the founder was a laundry customer who had
  clothes mixed up, items lost, clothes returned undried, and staff asking "is this
  yours?" on WhatsApp. Every feature maps to one of those failures.

## Market

- Small to medium laundries and dry cleaners in Ghana, run on paper books and
  WhatsApp. Owners live on WhatsApp and in person, not email.
- Sell outcomes (no mix-ups, run the shop from your phone), not features.
- Go-to-market: free pilot → testimonial → referrals.

## First customer: Kappa 7 Laundry & Dry Cleaning

- Met in person 2026-07-15. Agreed structure: **2 months free pilot**, then, if they
  see value, a **GHS 7,000 one-time system fee** (after the pilot, not upfront) +
  **GHS 200/month** (hosting, support, updates). These are agreed numbers; don't
  change them without the user.
- Their feature asks (both must exist in production):
  1. **Pickup reminders** when a ready order isn't collected.
  2. "Ready for pickup" goes out by **both SMS and WhatsApp**. Until WhatsApp is
     approved, SMS only; tell the client.
- The proposal doc is in the demo repo: `sales/proposals/kappa7-proposal.html`.
- Kappa 7 also has a marketing site (separate project, `~/Projects/kappa7-laundry`).

## Pricing hypotheses (SaaS plans, untested)

| Plan | Price | For |
|------|-------|-----|
| Starter | ~GHS 150–250/mo | single small shop |
| Growth | ~GHS 300–500/mo | busier shop, more staff/SMS |
| Business | higher | multi-branch / B2B (hotels, etc.) |

SMS cost per message is real money; plans should include an SMS allowance plus
top-ups. Sales materials (scripts, objections, ICP) are in the demo repo's `sales/` folder.
