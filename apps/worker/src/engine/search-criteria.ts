import type { SearchCriteria, SearchLocation } from "@job-app/shared";
import type { JobPreference, JobRole, JobRoleLocation } from "@job-app/db";

type RoleWithSearchConfig = JobRole & { preference: JobPreference | null; locations: JobRoleLocation[] };

export function buildSearchCriteria(role: RoleWithSearchConfig): SearchCriteria {
  if (!role.preference) {
    throw new Error(`Job role "${role.title}" has no preferences configured — this should have been caught by assertRoleIsRunnable`);
  }

  const locations: SearchLocation[] = role.locations.map((loc) => ({
    type: loc.locationType,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
  }));

  return {
    keyword: role.title,
    locations,
    datePosted: role.preference.datePosted,
    employmentType: role.preference.employmentType,
    workArrangement: role.preference.workArrangement,
  };
}
