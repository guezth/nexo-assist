import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmployeeShell } from "@/components/employee-shell";
import { formatElapsed } from "@/lib/format";
import { getSession } from "@/server/auth/session";
import { findProfile } from "@/server/auth/users";
import { getUsers } from "@/server/users";
import { can } from "@/domain/access";
import styles from "./perfil.module.css";
import { PasswordCard } from "./reset-password";

async function ProfileScreen() {
  const session = await getSession();
  if (!session || !can(session.accessLevel, "profile")) redirect("/login");
  const profile = await findProfile(await getUsers(), session.id);
  if (!profile) redirect("/login");

  const now = new Date();
  const changedAt = new Date(profile.passwordChangedAt);

  return (
    <EmployeeShell user={session} active="profile" title="Meu perfil">
      <div className={styles.page}>
        <div className={styles.content}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Meu perfil</h1>
            <p className={styles.subtitle}>Seus dados de acesso ao service desk de TI.</p>
          </div>

          <section className={styles.card} aria-label="Dados">
            <div className={`${styles.dataRow} ${styles.dataRowDivided}`}>
              <span className={styles.key}>Nome</span>
              <span className={styles.value}>{profile.name}</span>
            </div>
            <div className={styles.dataRow}>
              <span className={styles.key}>E-mail corporativo</span>
              <span className={styles.value}>{profile.email}</span>
              <span className={styles.note}>
                <Lock size={13} aria-hidden />
                Gerenciado pela TI
              </span>
            </div>
          </section>

          <PasswordCard email={profile.email} meta={`Alterada ${formatElapsed(changedAt, now)}`} />
        </div>
      </div>
    </EmployeeShell>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileScreen />
    </Suspense>
  );
}
