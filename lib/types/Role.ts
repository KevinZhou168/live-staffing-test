// Shared traits for all people

export interface Person {
    name: string;
    email: string;
    college: string;
    major: string;
    minor?: string;
    year: string;
    availability: string;
    timeZone: string;
    willingToTravel: boolean;
    weekBeforeFinals: boolean;
    firstGen: boolean;
    usCitizen: boolean;
    residency: string;
    race: string;
  }
  
  // Role: Senior Manager
  export interface SeniorManager extends Person {
    managedProjects: string[];
  }
  
  // Role: Project Manager
  export interface ProjectManager extends Person {
    project: string;
  }
  
  // Role: Senior Consultant
  export interface SeniorConsultant extends Person {
    functionalInterests: string[];
    interestedIndustries: string[];
    project: string;
  }
  
  // Role: Returning/New Consultant
  export interface Consultant extends Person {
    functionalInterests: string[];
    interestedIndustries: string[];
    project: string;
  }
  