// Role.ts
import type { Consultant } from './Consultant.ts';
import type { Project } from './Project.ts'; 

export interface SeniorManager extends Consultant {
  managedProjects: Project[];
}

export interface ProjectManager extends Consultant {
  project: Project;
}

export interface SeniorConsultant extends Consultant {
  project: Project;
}


