"use client";

import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./chat-top-bar.module.css";

export function ChatTopBar({ onNewTicket }: { onNewTicket: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.dropdown}>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Plus size={14} aria-hidden />
          Novo
          <ChevronDown size={14} aria-hidden className={open ? styles.chevronOpen : ""} />
        </button>
        {open && (
          <>
            <div className={styles.backdrop} onClick={() => setOpen(false)} />
            <ul className={styles.menu} role="menu">
              <li role="none">
                <Link href="/chat" className={styles.item} role="menuitem" onClick={() => setOpen(false)}>
                  Atendimento
                </Link>
              </li>
              <li role="none">
                <button
                  type="button"
                  className={styles.item}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onNewTicket();
                  }}
                >
                  Ticket
                </button>
              </li>
            </ul>
          </>
        )}
      </div>

      <div className={styles.status}>
        <span className={styles.statusDot} />
        Assistente online
      </div>
    </div>
  );
}
