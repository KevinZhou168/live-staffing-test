import { Person } from "./role";

// Enum for Role types, for clarity
export enum Role {
  SeniorManager = "SeniorManager",
  ProjectManager = "ProjectManager",
  SeniorConsultant = "SeniorConsultant",
  Consultant = "Consultant",
}

// Role-assigned person
export interface ProjectMember {
  person: Person;
  role: Role;
}

// Project structure
export interface Project {
  projectName: string;
  people: ProjectMember[];
}
