// Outbound message log. Messages are queued by the DB (ready trigger) or by
// staff (manual reminders) and sent by the send-messages Edge Function (Phase 3).
import { useState } from "react";
import { useStore } from "../store";
import { fmtTime, fmtDate, prettyPhone, timeAgo } from "../lib/format";
import type { Message, MsgStatus } from "../lib/types";
import { Avatar, Spinner } from "../ui";

const STATUS: Record<MsgStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-slate-100 text-slate-600" },
  sending: { label: "Sending", cls: "bg-brand-50 text-brand-700" },
  sent: { label: "Sent ✓", cls: "bg-teal-50 text-teal-700" },
  delivered: { label: "Delivered ✓✓", cls: "bg-teal-100 text-teal-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  skipped: { label: "Not sent", cls: "bg-slate-100 text-slate-400" },
};

export default function Messages() {
  const { messages, customerById, loading } = useStore();
  const [activeId, setActiveId] = useState<string | undefined>();
  if (loading) return <Spinner />;

  // Hide WhatsApp copies that are skipped because WhatsApp isn't enabled yet.
  const visible = messages.filter((m) => !(m.channel === "whatsapp" && m.status === "skipped"));
  const threads: { customerId: string; last: Message }[] = [];
  for (const m of visible) if (!threads.some((t) => t.customerId === m.customer_id)) threads.push({ customerId: m.customer_id, last: m });
  const currentId = activeId ?? threads[0]?.customerId;
  const thread = visible.filter((m) => m.customer_id === currentId).slice().reverse();
  const active = currentId ? customerById(currentId) : undefined;
  const queued = visible.filter((m) => m.status === "queued").length;

  return (
    <div className="space-y-5">
      <header className="animate-fade-up">
        <div className="text-sm font-semibold text-teal-500">Communication</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">Customer messages</h1>
        <p className="text-ink-soft text-sm mt-1">
          When an order is ready, the customer gets an SMS automatically. Reminders you send from the board show up here too.
        </p>
      </header>

      {queued > 0 && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-800 animate-fade-up">
          {queued} message{queued === 1 ? " is" : "s are"} queued. SMS sending switches on once the SMS provider is connected.
        </div>
      )}

      {threads.length === 0 ? (
        <div className="card rounded-2xl p-10 text-center animate-fade-up">
          <div className="text-4xl mb-2">💬</div>
          <div className="font-semibold text-ink">No messages yet</div>
          <div className="text-sm text-ink-soft mt-1">Move an order to “Ready for Pickup” and its SMS will appear here.</div>
        </div>
      ) : (
        <div className="card rounded-2xl overflow-hidden animate-fade-up grid md:grid-cols-[300px_1fr] md:h-[560px]">
          <div className="border-r border-slate-100 overflow-y-auto max-h-64 md:max-h-none">
            <div className="p-3 text-xs font-bold text-slate-400 uppercase tracking-wide sticky top-0 bg-white/90 backdrop-blur">Customers</div>
            {threads.map(({ customerId, last }) => {
              const c = customerById(customerId);
              return (
                <button
                  key={customerId}
                  onClick={() => setActiveId(customerId)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left transition ${
                    currentId === customerId ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={c?.name ?? "?"} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink text-sm truncate">{c?.name}</span>
                      <span className="text-[10px] text-slate-400">{timeAgo(last.created_at)}</span>
                    </div>
                    <div className="text-xs text-ink-soft truncate">{last.body}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col min-h-[400px] bg-[#efeae2]">
            <div className="flex items-center gap-3 px-4 py-3 bg-[#075e54] text-white">
              <Avatar name={active?.name ?? "?"} size={36} />
              <div>
                <div className="font-semibold text-sm">{active?.name}</div>
                <div className="text-[11px] opacity-80">{active && prettyPhone(active.phone)}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {thread.map((m) => (
                <div key={m.id} className="flex justify-end animate-pop">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 shadow-sm bg-[#dcf8c6]">
                    <div className="text-[10px] font-bold text-teal-700 mb-0.5">
                      {m.kind === "stage" ? "⚡ Automatic" : m.kind === "reminder" ? "🔔 Auto reminder" : "🔔 Sent by staff"} ·{" "}
                      {m.channel === "whatsapp" ? "WhatsApp" : "SMS"}
                    </div>
                    <div className="text-sm text-ink whitespace-pre-wrap">{m.body}</div>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${STATUS[m.status].cls}`} title={m.error ?? undefined}>
                        {STATUS[m.status].label}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {fmtDate(m.created_at)} {fmtTime(m.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
