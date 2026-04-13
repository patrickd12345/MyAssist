export type CandidateProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  country: string;
  linkedin: string;
  portfolio: string;
  resumeDefault: string;
  resumeVariants: string[];
  workHistory: Array<Record<string, string>>;
  education: Array<Record<string, string>>;
  certifications: string[];
  skills: string[];
  workAuthorization: string;
  willingToRelocate: string;
  salaryExpectation: string;
  remotePreference: string;
};

export type WorkdayField = {
  id: string;
  label: string;
  value?: string;
  required?: boolean;
  userEntered?: boolean;
  section?: string;
};

export type WorkdayMapping = {
  myAssistField?: keyof CandidateProfile;
  confidence: number;
};

export type AutofillDecision = {
  fieldId: string;
  label: string;
  myAssistField: keyof CandidateProfile;
  value: string;
};

export type MissingField = {
  fieldId: string;
  label: string;
  reason: "missing_profile_value" | "custom_question";
};

export type TrackerEntry = {
  company: string;
  role: string;
  reqId: string;
  ats: "workday";
  dateApplied: string;
  status: "submitted";
  source: "browser_autofill";
};

const URL_MARKERS = [/myworkdayjobs\.com/i, /wd\d+\.myworkdayjobs/i, /workday/i];
const VOLUNTARY_MARKERS = [/voluntary/i, /self[-\s]?identify/i, /disability/i, /veteran/i, /gender/i, /race/i];

const EXACT_LABEL_MAPPING: Record<string, keyof CandidateProfile> = {
  "first name": "firstName",
  "last name": "lastName",
  email: "email",
  phone: "phone",
  city: "city",
  "resume upload": "resumeDefault",
  "resume/cv": "resumeDefault",
  linkedin: "linkedin",
  "work authorization": "workAuthorization",
  "salary expectation": "salaryExpectation",
};

export function detectWorkdayApplicationPage(input: {
  url: string;
  domAutomationIdCount?: number;
  hasWorkdayFormStructure?: boolean;
}): { isWorkday: boolean; confidence: "low" | "medium" | "high" } {
  const hasUrlMarker = URL_MARKERS.some((marker) => marker.test(input.url));
  const hasDomMarker = (input.domAutomationIdCount ?? 0) > 0;
  const hasFormMarker = input.hasWorkdayFormStructure === true;

  if (hasUrlMarker && (hasDomMarker || hasFormMarker)) {
    return { isWorkday: true, confidence: "high" };
  }
  if (hasUrlMarker || (hasDomMarker && hasFormMarker)) {
    return { isWorkday: true, confidence: "medium" };
  }
  return { isWorkday: false, confidence: "low" };
}

export function mapWorkdayFieldToMyAssist(fieldLabel: string): WorkdayMapping {
  const normalized = normalize(fieldLabel);
  const exact = EXACT_LABEL_MAPPING[normalized];
  if (exact) {
    return { myAssistField: exact, confidence: 0.95 };
  }

  if (normalized.includes("first") && normalized.includes("name")) {
    return { myAssistField: "firstName", confidence: 0.9 };
  }
  if (normalized.includes("last") && normalized.includes("name")) {
    return { myAssistField: "lastName", confidence: 0.9 };
  }
  if (normalized.includes("authorization")) {
    return { myAssistField: "workAuthorization", confidence: 0.85 };
  }
  if (normalized.includes("salary")) {
    return { myAssistField: "salaryExpectation", confidence: 0.85 };
  }

  return { confidence: 0 };
}

export function buildWorkdayAutofillPlan(input: {
  profile: CandidateProfile;
  fields: WorkdayField[];
}): {
  autofill: AutofillDecision[];
  missing: MissingField[];
} {
  const autofill: AutofillDecision[] = [];
  const missing: MissingField[] = [];

  for (const field of input.fields) {
    if (shouldSkipField(field)) {
      continue;
    }

    const mapped = mapWorkdayFieldToMyAssist(field.label);
    const isEmpty = !clean(field.value);

    if (!mapped.myAssistField) {
      if (field.required && isEmpty) {
        missing.push({ fieldId: field.id, label: field.label, reason: "custom_question" });
      }
      continue;
    }

    if (field.userEntered || !isEmpty || mapped.confidence < 0.8) {
      continue;
    }

    const value = clean(input.profile[mapped.myAssistField]);
    if (!value) {
      if (field.required) {
        missing.push({
          fieldId: field.id,
          label: field.label,
          reason: "missing_profile_value",
        });
      }
      continue;
    }

    autofill.push({
      fieldId: field.id,
      label: field.label,
      myAssistField: mapped.myAssistField,
      value,
    });
  }

  return { autofill, missing };
}

export function createWorkdayTrackerEntry(input: {
  company: string;
  role: string;
  reqId: string;
  now?: Date;
}): TrackerEntry {
  return {
    company: clean(input.company),
    role: clean(input.role),
    reqId: clean(input.reqId),
    ats: "workday",
    dateApplied: (input.now ?? new Date()).toISOString(),
    status: "submitted",
    source: "browser_autofill",
  };
}

function shouldSkipField(field: WorkdayField): boolean {
  const label = normalize(field.label);
  const section = normalize(field.section ?? "");
  return VOLUNTARY_MARKERS.some((marker) => marker.test(label) || marker.test(section));
}

function normalize(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
