import type { Analyst, Employee } from "@/domain/types";
import { hashPassword } from "@/lib/password";

// Demo-only credential shared by every seed user. Documented in the README.
export const DEMO_PASSWORD = "nexo123";
const passwordHash = hashPassword(DEMO_PASSWORD, "nexo-demo-salt");

type EmployeeSeed = Omit<Employee, "role" | "passwordHash" | "passwordChangedDaysAgo"> & { passwordChangedDaysAgo?: number };
type AnalystSeed = Omit<Analyst, "role" | "passwordHash" | "passwordChangedDaysAgo">;

const employeeSeeds: EmployeeSeed[] = [
  { id: 1, name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro", operatingSystem: "Windows 11", passwordChangedDaysAgo: 42 },
  { id: 2, name: "Carla Mendes", email: "carla.mendes@nexo.com.br", department: "Controladoria", operatingSystem: "Windows 11" },
  { id: 3, name: "Bruno Tavares", email: "bruno.tavares@nexo.com.br", department: "Comercial", operatingSystem: "Windows 10" },
  { id: 4, name: "Diego Ramos", email: "diego.ramos@nexo.com.br", department: "Engenharia", operatingSystem: "macOS" },
  { id: 5, name: "Elisa Prado", email: "elisa.prado@nexo.com.br", department: "Marketing", operatingSystem: "Windows 11" },
  { id: 6, name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", department: "Operações", operatingSystem: "Windows 10" },
  { id: 7, name: "Gabriela Rocha", email: "gabriela.rocha@nexo.com.br", department: "RH", operatingSystem: "Windows 11" },
];

export const employees: Employee[] = employeeSeeds.map((e) => ({ passwordChangedDaysAgo: 30, ...e, role: "employee", passwordHash }));

const analystSeeds: AnalystSeed[] = [
  { id: 8, name: "Rafael Lima", email: "rafael.lima@nexo.com.br", level: "N2" },
  { id: 9, name: "Juliana Costa", email: "juliana.costa@nexo.com.br", level: "N1" },
];

export const analysts: Analyst[] = analystSeeds.map((a) => ({ ...a, role: "analyst", passwordHash, passwordChangedDaysAgo: 30 }));
