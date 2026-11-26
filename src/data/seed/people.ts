import type { Analyst, Employee } from "@/domain/types";

// Demo-only credential shared by every seed user (it is hashed when the users table is seeded). Documented in the README.
export const DEMO_PASSWORD = "nexo123";

/** How long ago each seed password was last changed (shown on the profile). */
export const passwordAgeDays: Record<number, number> = { 1: 42 };
export const DEFAULT_PASSWORD_AGE_DAYS = 30;

type EmployeeSeed = Omit<Employee, "role">;
type AnalystSeed = Omit<Analyst, "role">;

const employeeSeeds: EmployeeSeed[] = [
  { id: 1, name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro", operatingSystem: "Windows 11" },
  { id: 2, name: "Carla Mendes", email: "carla.mendes@nexo.com.br", department: "Controladoria", operatingSystem: "Windows 11" },
  { id: 3, name: "Bruno Tavares", email: "bruno.tavares@nexo.com.br", department: "Comercial", operatingSystem: "Windows 10" },
  { id: 4, name: "Diego Ramos", email: "diego.ramos@nexo.com.br", department: "Engenharia", operatingSystem: "macOS" },
  { id: 5, name: "Elisa Prado", email: "elisa.prado@nexo.com.br", department: "Marketing", operatingSystem: "Windows 11" },
  { id: 6, name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", department: "Operações", operatingSystem: "Windows 10" },
  { id: 7, name: "Gabriela Rocha", email: "gabriela.rocha@nexo.com.br", department: "RH", operatingSystem: "Windows 11" },
];

export const employees: Employee[] = employeeSeeds.map((e) => ({ ...e, role: "employee" }));

const analystSeeds: AnalystSeed[] = [
  { id: 8, name: "Rafael Lima", email: "rafael.lima@nexo.com.br", level: "N2" },
  { id: 9, name: "Juliana Costa", email: "juliana.costa@nexo.com.br", level: "N1" },
];

export const analysts: Analyst[] = analystSeeds.map((a) => ({ ...a, role: "analyst" }));
