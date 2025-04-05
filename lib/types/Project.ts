import { Consultant, Role } from "./Consultant.ts";

// Role-assigned person
export interface ProjectMember {
  consultant: Consultant;
  role: Role;
}


// Project structure
export interface Project {
  projectID: number;
  projectName: string;
  projectSemester: string;
  clientName: string;
  EMid: ProjectMember;
  SMid: ProjectMember;
  PMid: ProjectMember;
  SCids:ProjectMember[];

  //returning and new consultants
  Consultantids: ProjectMember[];
}


/*each entry in this map would be sm -> projects they are in charge of
{
  "SMUserID": {
  "Project1ID":{
    "PM": UserID
    "SC": [UserID, UserID, ...]

    // to be filled
    "NC":[]
  }

  "Project2ID":{
    "PM": UserID
    "SC": [UserID, UserID, ...]

    // to be filled
    "NC":[]
  }
  }
}

*/
