// Data for the active laundry, loaded from Supabase (RLS scopes every query to
// orgs the user belongs to; we also filter by org_id since a user can be in
// several). Replaces the demo's localStorage store.
//
// Customer messages are NOT generated here: the orders_stage DB trigger queues
// the "ready" SMS/WhatsApp. The only message the app inserts is a manual
// pickup reminder.
//
// Writes go straight to Supabase for now (orders via the create_order RPC); Phase 4 puts an IndexedDB outbox in
// front of them (ids are already client-generated so replays are safe).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase, friendlyError, PHOTO_BUCKET } from "./lib/supabase";
import { takeCode, itemTag } from "./lib/codes";
import { photoPath } from "./lib/photo";
import { cedis, firstName, startOfToday } from "./lib/format";
import { READY_HOURS } from "./lib/catalog";
import {
  balanceOf,
  nextStage,
  stageMeta,
  type Customer,
  type Flag,
  type Message,
  type Order,
  type Org,
  type PayMethod,
  type Payment,
  type Role,
  type Service,
  type Stage,
} from "./lib/types";

export interface Toast {
  id: string;
  title: string;
  body: string;
  emoji: string;
  tone: "info" | "success" | "warn" | "error";
}

export interface DraftItem {
  key: string; // local React key
  type: string;
  colorName: string;
  colorHex: string;
  serviceId: string;
  qty: number;
  note?: string;
  flag?: Flag;
  photo?: Blob;
  photoPreview?: string; // object URL for display while drafting
}

interface Store {
  org: Org;
  role: Role;
  displayName: string;
  loading: boolean;
  services: Service[];
  customers: Customer[];
  orders: Order[];
  messages: Message[];
  todayPayments: Payment[];
  toasts: Toast[];
  customerById: (id: string) => Customer | undefined;
  serviceById: (id: string | null) => Service | undefined;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  addCustomer: (name: string, phoneE164: string) => Promise<Customer | null>;
  createOrder: (d: { customerId: string; express: boolean; items: DraftItem[] }) => Promise<Order | null>;
  setStage: (orderId: string, stage: Stage) => Promise<void>;
  advance: (orderId: string) => Promise<void>;
  addPayment: (orderId: string, amount: number, method: PayMethod, reference?: string) => Promise<boolean>;
  sendReminder: (orderId: string) => Promise<void>;
  loadCustomerOrders: (customerId: string) => Promise<Order[]>;
}

const Ctx = createContext<Store | null>(null);

export const ORDER_SELECT = "*, order_items(*), order_events(*), payments(*)";

/** Board/dashboard show open orders plus anything delivered in the last few days. */
const DELIVERED_WINDOW_DAYS = 3;

function sortNested(o: Order): Order {
  o.order_items.sort((a, b) => a.tag.localeCompare(b.tag));
  o.order_events.sort((a, b) => a.at.localeCompare(b.at));
  o.payments.sort((a, b) => a.received_at.localeCompare(b.received_at));
  return o;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { active, session } = useAuth();
  const org = active!.organizations;
  const orgId = org.id;
  const userId = session!.user.id;

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [todayPayments, setTodayPayments] = useState<Payment[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4600);
  }, []);

  const fail = useCallback(
    (title: string, e: unknown) => {
      console.error(title, e);
      toast({ title, body: friendlyError(e), emoji: "⚠️", tone: "error" });
    },
    [toast]
  );

  const refresh = useCallback(async () => {
    const since = new Date(Date.now() - DELIVERED_WINDOW_DAYS * 86400000).toISOString();
    const [s, c, o, m, p] = await Promise.all([
      supabase.from("services").select("*").eq("org_id", orgId).order("sort"),
      supabase.from("customers").select("*").eq("org_id", orgId).order("name").limit(5000),
      supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("org_id", orgId)
        .or(`stage.neq.delivered,collected_at.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("messages").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(300),
      supabase.from("payments").select("*").eq("org_id", orgId).gte("received_at", startOfToday().toISOString()),
    ]);
    const err = s.error ?? c.error ?? o.error ?? m.error ?? p.error;
    if (err) fail("Couldn't load data", err);
    if (s.data) setServices(s.data as Service[]);
    if (c.data) setCustomers(c.data as Customer[]);
    if (o.data) setOrders((o.data as Order[]).map(sortNested));
    if (m.data) setMessages(m.data as Message[]);
    if (p.data) setTodayPayments(p.data as Payment[]);
    setLoading(false);
  }, [orgId, fail]);

  // Initial load, then keep fresh: on focus, every 30s, and on any change by
  // another device (realtime; RLS applies to the change feed too).
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    setLoading(true);
    refresh();
    const onFocus = () => refreshRef.current();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(onFocus, 30_000);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(pending);
      pending = setTimeout(onFocus, 400);
    };
    const channel = supabase
      .channel(`org-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `org_id=eq.${orgId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` }, debounced)
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
      clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [orgId, refresh]);

  const customerById = useCallback((id: string) => customers.find((c) => c.id === id), [customers]);
  const serviceById = useCallback((id: string | null) => services.find((s) => s.id === id), [services]);

  const addCustomer = useCallback(
    async (name: string, phone: string): Promise<Customer | null> => {
      const row = { id: crypto.randomUUID(), org_id: orgId, name: name.trim(), phone };
      const { data, error } = await supabase.from("customers").insert(row).select().single();
      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await supabase
            .from("customers")
            .select("*")
            .eq("org_id", orgId)
            .eq("phone", phone)
            .single();
          if (existing) {
            toast({
              title: "Client already exists",
              body: `${existing.name} already uses this number. Selected them instead.`,
              emoji: "👤",
              tone: "info",
            });
            return existing as Customer;
          }
        }
        fail("Couldn't add client", error);
        return null;
      }
      const c = data as Customer;
      setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      toast({ title: "New client added", body: `${c.name} is now in your directory.`, emoji: "🧑‍🤝‍🧑", tone: "success" });
      return c;
    },
    [orgId, toast, fail]
  );

  const reserve = useCallback(
    async (n: number) => {
      const { data, error } = await supabase.rpc("reserve_order_codes", { o: orgId, n });
      if (error) throw error;
      return (data as { prefix: string; first_number: number; last_number: number }[])[0];
    },
    [orgId]
  );

  const createOrder = useCallback(
    async ({ customerId, express, items }: { customerId: string; express: boolean; items: DraftItem[] }) => {
      if (items.length === 0) return null;
      const orderId = crypto.randomUUID();
      const withIds = items.map((it) => ({ ...it, id: crypto.randomUUID() }));
      const readyBy = new Date(Date.now() + (express ? READY_HOURS.express : READY_HOURS.standard) * 3600000).toISOString();

      try {
        // Photos first, so an item row never points at a missing file.
        const paths: Record<string, string> = {};
        for (const it of withIds) {
          if (!it.photo) continue;
          const path = photoPath(orgId, orderId, it.id);
          const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, it.photo, { contentType: "image/jpeg" });
          if (error) throw error;
          paths[it.id] = path;
        }

        // Order + items in one transaction (create_order RPC); the DB prices
        // items from the price list. A code can collide only if two tabs on
        // this device share a block; retry with the next one.
        for (let attempt = 0; ; attempt++) {
          const code = await takeCode(orgId, reserve);
          const { error } = await supabase.rpc("create_order", {
            p_order: {
              id: orderId,
              org_id: orgId,
              customer_id: customerId,
              code,
              express,
              ready_by: readyBy,
              photo_verified: Object.keys(paths).length > 0,
            },
            p_items: withIds.map((it, i) => ({
              id: it.id,
              tag: itemTag(code, i),
              type: it.type,
              color_name: it.colorName,
              color_hex: it.colorHex.startsWith("#") ? it.colorHex : null,
              service_id: it.serviceId,
              qty: it.qty,
              note: it.note || null,
              flag: it.flag ?? null,
              photo_path: paths[it.id] ?? null,
            })),
          });
          if (!error) break;
          if (error.code !== "23505" || attempt >= 2) throw error;
        }

        const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", orderId).single();
        if (error) throw error;
        const order = sortNested(data as Order);
        setOrders((prev) => [order, ...prev.filter((o) => o.id !== orderId)]);
        toast({ title: `Order ${order.code} created`, body: `${items.length} item lines tagged.`, emoji: "🎫", tone: "success" });
        return order;
      } catch (e) {
        fail("Couldn't create order", e);
        return null;
      }
    },
    [orgId, reserve, toast, fail]
  );

  const setStage = useCallback(
    async (orderId: string, stage: Stage) => {
      const order = orders.find((o) => o.id === orderId);
      const prevStage = order?.stage;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, stage } : o))); // optimistic
      const { error } = await supabase.from("orders").update({ stage }).eq("id", orderId);
      if (error) {
        if (prevStage) setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, stage: prevStage } : o)));
        return fail("Couldn't update order", error);
      }
      const meta = stageMeta(stage);
      const c = order && customerById(order.customer_id);
      toast({
        title: `${order?.code ?? "Order"} → ${meta.label}`,
        body:
          stage === "ready"
            ? c?.sms_opt_out
              ? `${c.name} opted out of SMS. Call them instead.`
              : `Pickup SMS queued for ${c ? firstName(c.name) : "the customer"}.`
            : c?.name ?? "",
        emoji: stage === "ready" ? "💬" : meta.emoji,
        tone: stage === "ready" || stage === "delivered" ? "success" : "info",
      });
      refresh();
    },
    [orders, customerById, toast, fail, refresh]
  );

  const advance = useCallback(
    async (orderId: string) => {
      const o = orders.find((x) => x.id === orderId);
      const next = o && nextStage(o.stage);
      if (next) await setStage(orderId, next);
    },
    [orders, setStage]
  );

  const addPayment = useCallback(
    async (orderId: string, amount: number, method: PayMethod, reference?: string) => {
      const { error } = await supabase.from("payments").insert({
        id: crypto.randomUUID(),
        org_id: orgId,
        order_id: orderId,
        amount,
        method,
        reference: reference || null,
        received_by: userId,
      });
      if (error) {
        fail("Couldn't record payment", error);
        return false;
      }
      const o = orders.find((x) => x.id === orderId);
      toast({
        title: "Payment recorded",
        body: `${cedis(amount)} for ${o?.code ?? "order"}`,
        emoji: "💰",
        tone: "success",
      });
      await refresh();
      return true;
    },
    [orgId, userId, orders, toast, fail, refresh]
  );

  const sendReminder = useCallback(
    async (orderId: string) => {
      const o = orders.find((x) => x.id === orderId);
      const c = o && customerById(o.customer_id);
      if (!o || !c) return;
      if (c.sms_opt_out) {
        toast({ title: "Client opted out of SMS", body: `Call ${c.name} instead.`, emoji: "📵", tone: "warn" });
        return;
      }
      const bal = balanceOf(o);
      const body = `${org.name}: Reminder, ${o.code} is ready for pickup. ${bal > 0 ? `Balance ${cedis(bal)}.` : "Fully paid."}`;
      const { error } = await supabase.from("messages").insert({
        id: crypto.randomUUID(),
        org_id: orgId,
        customer_id: c.id,
        order_id: o.id,
        channel: "sms",
        kind: "manual",
        body,
        to_phone: c.phone,
        status: "queued",
      });
      if (error) return fail("Couldn't queue reminder", error);
      await supabase
        .from("orders")
        .update({ reminders_sent: o.reminders_sent + 1, last_reminder_at: new Date().toISOString() })
        .eq("id", o.id);
      toast({ title: `Reminder queued for ${firstName(c.name)}`, body, emoji: "🔔", tone: "warn" });
      refresh();
    },
    [org.name, orgId, orders, customerById, toast, fail, refresh]
  );

  const loadCustomerOrders = useCallback(
    async (customerId: string) => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) fail("Couldn't load history", error);
      return ((data as Order[]) ?? []).map(sortNested);
    },
    [orgId, fail]
  );

  return (
    <Ctx.Provider
      value={{
        org,
        role: active!.role,
        displayName: active!.display_name,
        loading,
        services,
        customers,
        orders,
        messages,
        todayPayments,
        toasts,
        customerById,
        serviceById,
        refresh,
        toast,
        dismissToast: (id) => setToasts((p) => p.filter((t) => t.id !== id)),
        addCustomer,
        createOrder,
        setStage,
        advance,
        addPayment,
        sendReminder,
        loadCustomerOrders,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
