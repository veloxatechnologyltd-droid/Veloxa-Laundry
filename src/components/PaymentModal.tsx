import { useState } from "react";
import { useStore } from "../store";
import { cedis, parseCedis } from "../lib/format";
import { PAY_METHODS, balanceOf, type Order, type PayMethod } from "../lib/types";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "../ui";

export default function PaymentModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { addPayment, customerById } = useStore();
  const balance = balanceOf(order);
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const pesewas = parseCedis(amount);
  const valid = pesewas !== null && pesewas > 0;
  const c = customerById(order.customer_id);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await addPayment(order.id, pesewas!, method, reference.trim());
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display font-bold text-lg text-ink">Take payment</h2>
      <p className="text-xs text-ink-soft">
        {order.code} · {c?.name} · total {cedis(order.total)}, paid {cedis(order.amount_paid)}
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <label className={labelCls}>Amount (₵)</label>
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            inputMode="decimal"
            className={`${inputCls} font-display text-xl font-bold`}
          />
          <div className="text-[11px] text-slate-400 mt-1">
            Balance due {cedis(balance)}. Part payments are fine.
            {pesewas !== null && pesewas > balance && balance > 0 && (
              <span className="text-amber-600 font-semibold"> More than the balance.</span>
            )}
          </div>
        </div>
        <div>
          <label className={labelCls}>Method</label>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {PAY_METHODS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`rounded-xl py-2.5 text-xs font-semibold flex flex-col items-center gap-0.5 transition ${
                  method === m.key ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30" : "bg-white ring-soft text-ink-soft"
                }`}
              >
                <span className="text-lg">{m.emoji}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {method !== "cash" && (
          <div>
            <label className={labelCls}>Reference (optional)</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputCls}
              placeholder={method === "momo" ? "MoMo transaction ID" : "Reference"}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-6">
        <button onClick={onClose} className={`${secondaryBtn} flex-1`}>
          Cancel
        </button>
        <button onClick={submit} disabled={!valid || busy} className={`${primaryBtn} flex-1`}>
          {busy ? "Saving…" : `Record ${valid ? cedis(pesewas!) : ""}`}
        </button>
      </div>
    </Modal>
  );
}
