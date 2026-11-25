"use client";

import { useEffect, useState } from "react";
import styles from "./login.module.css";

const POLL_MS = 15_000;

/** "N analistas online agora": starts from the number the server rendered and keeps itself up to date. */
export function OnlineAnalysts({ initial }: { initial: number }) {
  const [online, setOnline] = useState(initial);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/presence", { cache: "no-store" });
        if (response.ok) setOnline(((await response.json()) as { online: number }).online);
      } catch {
        // Keep the last number; try again on the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const label = online === 1 ? "analista online agora" : "analistas online agora";
  return (
    <div className={styles.stat}>
      <div className={styles.statValue} aria-label={`${online} ${label}`}>
        {/* Remounted when the number changes, so it counts up again. */}
        <span key={online} className={styles.count} style={{ "--n": online } as React.CSSProperties} aria-hidden />
        <span className={online > 0 ? styles.live : styles.liveOff} aria-hidden />
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

/** Same shape while the number is being fetched. */
export function OnlineAnalystsFallback() {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>
        <span className={styles.countPlaceholder}>–</span>
      </div>
      <div className={styles.statLabel}>analistas online agora</div>
    </div>
  );
}
