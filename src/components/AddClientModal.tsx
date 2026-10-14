import { useState } from "react";
import { useStore } from "../store";
import { toE164, prettyPhone } from "../lib/format";
import type { Customer } from "../lib/types";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "../ui";

export default function AddClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (c: Customer) => void;
}) {
  const { addCustomer } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const e164 = toE164(phone);
  const nameOk = name.trim().length >= 2;
  const valid = nameOk && !!e164;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    const c = await addCustomer(name, e164!);
    setBusy(false);
    if (c) {
      onCreated?.(c);
      onClose();
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3">
        <div className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 text-white text-xl">
          🧑‍🤝‍🧑
        </div>
        <div>
          <h2 className="font-display font-bold text-lg text-ink">Register a walk-in</h2>
          <p className="text-xs text-ink-soft">Add a new client in seconds, then start their order.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <label className={labelCls}>Full name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. Kwabena Mensah"
            className={inputCls}
          />
          {touched && !nameOk && <div className="text-[11px] text-red-500 mt-1">Please enter the client's name.</div>}
        </div>
        <div>
          <label className={labelCls}>Phone (WhatsApp / SMS)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="024 000 0000"
            inputMode="tel"
            className={inputCls}
          />
          <div className={`text-[11px] mt-1 ${touched && !e164 ? "text-red-500" : "text-slate-400"}`}>
            {e164
              ? `Saved as ${prettyPhone(e164)}. Used for pickup SMS and the tracking link.`
              : touched
              ? "Enter a valid phone number, e.g. 024 118 4477."
              : "Used for pickup SMS and the tracking link."}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-6">
        <button onClick={onClose} className={`${secondaryBtn} flex-1`}>
          Cancel
        </button>
        <button onClick={submit} disabled={busy} className={`${primaryBtn} flex-1`}>
          {busy ? "Saving…" : "Add client"}
        </button>
      </div>
    </Modal>
  );
}
