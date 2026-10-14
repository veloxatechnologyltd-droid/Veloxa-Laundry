// Row types mirroring supabase/migrations. Money fields are integer pesewas.

export type Stage = "received" | "washing" | "drying" | "ironing" | "ready" | "delivered";
export type Flag = "vip" | "delicate" | "stain";
export type Role = "owner" | "manager" | "staff";
export type PayMethod = "cash" | "momo" | "card" | "bank";
export type MsgChannel = "sms" | "whatsapp";
export type MsgStatus = "queued" | "sending" | "sent" | "delivered" | "failed" | "skipped";
export type MsgKind = "stage" | "reminder" | "manual";

export const STAGES: { key: Stage; label: string; emoji: string; color: string }[] = [
  { key: "received", label: "Received", emoji: "📥", color: "#64748b" },
  { key: "washing", label: "Washing", emoji: "🫧", color: "#3366ff" },
  { key: "drying", label: "Drying", emoji: "☀️", color: "#f59e0b" },
  { key: "ironing", label: "Ironing & Fold", emoji: "🪭", color: "#8b5cf6" },
  { key: "ready", label: "Ready for Pickup", emoji: "✅", color: "#14b8a6" },
  { key: "delivered", label: "Delivered", emoji: "🎉", color: "#10b981" },
];

export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.key === s);
export const stageMeta = (s: Stage) => STAGES.find((x) => x.key === s)!;
export const nextStage = (s: Stage): Stage | undefined => STAGES[stageIndex(s) + 1]?.key;

export const PAY_METHODS: { key: PayMethod; label: string; emoji: string }[] = [
  { key: "cash", label: "Cash", emoji: "💵" },
  { key: "momo", label: "Mobile Money", emoji: "📱" },
  { key: "card", label: "Card", emoji: "💳" },
  { key: "bank", label: "Bank", emoji: "🏦" },
];

export interface Org {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  code_prefix: string;
  timezone: string;
  currency: string;
  plan: "trial" | "starter" | "growth" | "business";
  paid_until: string;
  sms_sender_id: string | null;
  whatsapp_enabled: boolean;
  reminder_after: string; // postgres interval, e.g. "24:00:00"
  reminder_max: number;
}

export interface Membership {
  org_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  organizations: Org;
}

export interface Service {
  id: string;
  org_id: string;
  label: string;
  unit: string;
  price: number;
  active: boolean;
  sort: number;
}

export interface Customer {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  vip: boolean;
  notes: string | null;
  sms_opt_out: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  org_id: string;
  order_id: string;
  tag: string;
  type: string;
  color_name: string | null;
  color_hex: string | null;
  service_id: string | null;
  qty: number;
  unit_price: number;
  note: string | null;
  flag: Flag | null;
  photo_path: string | null;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  stage: Stage;
  note: string | null;
  by_user: string | null;
  at: string;
}

export interface Payment {
  id: string;
  org_id: string;
  order_id: string;
  amount: number;
  method: PayMethod;
  reference: string | null;
  received_at: string;
}

export interface Order {
  id: string;
  org_id: string;
  branch_id: string | null;
  customer_id: string;
  code: string;
  stage: Stage;
  express: boolean;
  total: number;
  amount_paid: number;
  ready_by: string | null;
  ready_at: string | null;
  collected_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
  tracking_token: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
  order_events: OrderEvent[];
  payments: Payment[];
}

export interface Message {
  id: string;
  org_id: string;
  customer_id: string;
  order_id: string | null;
  channel: MsgChannel;
  kind: MsgKind;
  body: string;
  to_phone: string;
  status: MsgStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

/** Shape returned by the public get_tracking(token) RPC. */
export interface TrackingInfo {
  shop: string;
  code: string;
  stage: Stage;
  ready_by: string | null;
  total: number;
  paid: number;
  customer: string;
  items: { tag: string; type: string; color: string | null; qty: number }[];
  timeline: { stage: Stage; at: string }[];
}

export const itemCount = (o: Pick<Order, "order_items">) => o.order_items.reduce((s, i) => s + i.qty, 0);
export const balanceOf = (o: Pick<Order, "total" | "amount_paid">) => Math.max(0, o.total - o.amount_paid);
