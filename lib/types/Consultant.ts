export enum Role {
  SeniorManager = "SeniorManager",
  ProjectManager = "ProjectManager",
  SeniorConsultant = "SeniorConsultant",
  Consultant = "Consultant",
}

// Shared traits for all active consultants (not including users that are taking gap or not part of IBC)
export interface Consultant {
    userID: number;
    name: string;
    email: string;
    UIN: string;
    netid: string;
    college: string;
    major: string;
    minor?: string;
    year: string;
    timeZone: string;
    willingToTravel: boolean;
    weekBeforeFinals: boolean;
    firstGen: boolean;
    usCitizen: boolean;
    residency: string;
    race: string;
    availability_Mon: string;
    availability_Tue: string;
    availability_Wed: string;
    availability_Thurs: string;
    availability_Fri: string;
    availability_Sat: string;
    availability_Sun: string;
    consultantScore: number;
    semestersinIBC: number;
    industryInterests: string;
    functionalInterests: string;
  }

