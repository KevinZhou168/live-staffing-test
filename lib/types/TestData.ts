// mockData.ts
import type { Consultant } from './Consultant.ts';
import { Role } from './Consultant.ts';
import type { Project, ProjectMember } from './Project.ts';
import type { SeniorManager, SeniorConsultant, ProjectManager } from './ProjectMapping.ts';

const baseConsultant: Consultant = {
  userID: 0,
  name: "",
  email: "",
  UIN: "000000000",
  netid: "",
  college: "Business",
  major: "Finance",
  year: "Junior",
  timeZone: "CST",
  willingToTravel: true,
  weekBeforeFinals: false,
  firstGen: false,
  usCitizen: true,
  residency: "In-state",
  race: "Asian",
  availability_Mon: "10-12",
  availability_Tue: "1-3",
  availability_Wed: "9-11",
  availability_Thurs: "2-4",
  availability_Fri: "10-12",
  availability_Sat: "",
  availability_Sun: "",
  consultantScore: 85,
  semestersinIBC: 2,
  industryInterests: "Consulting",
  functionalInterests: "Strategy",
};

// Senior Managers
const seniorManager1: SeniorManager = {
  ...baseConsultant,
  userID: 2001,
  name: "Sophia Zhang",
  email: "szhang@university.edu",
  netid: "szhang",
  consultantScore: 95,
  semestersinIBC: 4,
  managedProjects: [],
};

const seniorManager2: SeniorManager = {
  ...baseConsultant,
  userID: 2002,
  name: "Liam Patel",
  email: "lpatel@university.edu",
  netid: "lpatel",
  consultantScore: 93,
  semestersinIBC: 4,
  managedProjects: [],
};

// -------------------- Projects --------------------

function createProject(
  id: number,
  name: string,
  semester: string,
  client: string,
  sm: SeniorManager,
  pmID: number,
  scIDs: number[],
  ncIDs: number[]
): Project {
  const PM: ProjectManager = {
    ...baseConsultant,
    userID: pmID,
    name: `PM ${pmID}`,
    email: `pm${pmID}@university.edu`,
    netid: `pm${pmID}`,
    semestersinIBC: 3,
    consultantScore: 90,
    project: {} as Project,
  };

  const SCs: ProjectMember[] = scIDs.map((id) => ({
    consultant: {
      ...baseConsultant,
      userID: id,
      name: `SC ${id}`,
      email: `sc${id}@university.edu`,
      netid: `sc${id}`,
      semestersinIBC: 3,
      consultantScore: 88,
      project: {} as Project,
    } as SeniorConsultant,
    role: Role.SeniorConsultant,
  }));

  const NCs: ProjectMember[] = ncIDs.map((id) => ({
    consultant: {
      ...baseConsultant,
      userID: id,
      name: `NC ${id}`,
      email: `nc${id}@university.edu`,
      netid: `nc${id}`,
      semestersinIBC: 1,
      consultantScore: 75,
    },
    role: Role.Consultant,
  }));

  const project: Project = {
    projectID: id,
    projectName: name,
    projectSemester: semester,
    clientName: client,
    EMid: { consultant: sm, role: Role.SeniorManager },
    SMid: { consultant: sm, role: Role.SeniorManager },
    PMid: { consultant: PM, role: Role.ProjectManager },
    SCids: SCs,
    Consultantids: NCs,
  };

  PM.project = project;
  SCs.forEach((sc) => ((sc.consultant as SeniorConsultant).project = project));
  sm.managedProjects.push(project);

  return project;
}

// Projects managed by SeniorManager1
const project1 = createProject(3001, "Market Expansion A", "Spring 2025", "Client A", seniorManager1, 4001, [5001, 5002], [6001, 6002]);
const project2 = createProject(3002, "Operational Efficiency A", "Spring 2025", "Client B", seniorManager1, 4002, [5003], [6003]);

// Projects managed by SeniorManager2
const project3 = createProject(3003, "Digital Transformation B", "Spring 2025", "Client C", seniorManager2, 4003, [5004, 5005], [6004]);
const project4 = createProject(3004, "Growth Strategy B", "Spring 2025", "Client D", seniorManager2, 4004, [5006], [6005, 6006]);

// -------------------- SM → Projects Mapping --------------------

const smProjectMap = {
  [seniorManager1.userID]: {
    [project1.projectID]: {
      PM: 4001,
      SC: [5001, 5002],
      NC: [6001, 6002],
    },
    [project2.projectID]: {
      PM: 4002,
      SC: [5003],
      NC: [6003],
    },
  },
  [seniorManager2.userID]: {
    [project3.projectID]: {
      PM: 4003,
      SC: [5004, 5005],
      NC: [6004],
    },
    [project4.projectID]: {
      PM: 4004,
      SC: [5006],
      NC: [6005, 6006],
    },
  },
};

export {
  seniorManager1,
  seniorManager2,
  project1,
  project2,
  project3,
  project4,
  smProjectMap,
};
