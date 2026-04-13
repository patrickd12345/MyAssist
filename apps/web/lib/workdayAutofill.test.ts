import { describe, expect, it } from "vitest";
import {
  buildWorkdayAutofillPlan,
  createWorkdayTrackerEntry,
  detectWorkdayApplicationPage,
  mapWorkdayFieldToMyAssist,
  type CandidateProfile,
} from "./workdayAutofill";

const PROFILE: CandidateProfile = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+1 555-0100",
  city: "Toronto",
  province: "ON",
  country: "CA",
  linkedin: "https://linkedin.com/in/ada",
  portfolio: "https://ada.dev",
  resumeDefault: "resume-default.pdf",
  resumeVariants: ["resume-backend.pdf"],
  workHistory: [],
  education: [],
  certifications: [],
  skills: [],
  workAuthorization: "Authorized to work in Canada",
  willingToRelocate: "yes",
  salaryExpectation: "140000 CAD",
  remotePreference: "hybrid",
};

describe("detectWorkdayApplicationPage", () => {
  it("detects with high confidence from url plus dom markers", () => {
    expect(
      detectWorkdayApplicationPage({
        url: "https://company.wd5.myworkdayjobs.com/en-US/careers/job/123/apply",
        domAutomationIdCount: 8,
      }),
    ).toEqual({ isWorkday: true, confidence: "high" });
  });

  it("returns low confidence for non-workday pages", () => {
    expect(
      detectWorkdayApplicationPage({
        url: "https://example.com/jobs/apply",
        domAutomationIdCount: 0,
        hasWorkdayFormStructure: false,
      }),
    ).toEqual({ isWorkday: false, confidence: "low" });
  });
});

describe("mapWorkdayFieldToMyAssist", () => {
  it("maps field examples from the mvp scope", () => {
    expect(mapWorkdayFieldToMyAssist("First Name").myAssistField).toBe("firstName");
    expect(mapWorkdayFieldToMyAssist("Resume Upload").myAssistField).toBe("resumeDefault");
    expect(mapWorkdayFieldToMyAssist("Work Authorization").myAssistField).toBe("workAuthorization");
  });
});

describe("buildWorkdayAutofillPlan", () => {
  it("autofills empty known fields and flags missing required values", () => {
    const plan = buildWorkdayAutofillPlan({
      profile: { ...PROFILE, salaryExpectation: "" },
      fields: [
        { id: "f1", label: "First Name", value: "", required: true },
        { id: "f2", label: "Work Authorization", value: "", required: true },
        { id: "f3", label: "Salary Expectation", value: "", required: true },
        { id: "f4", label: "Custom Question #1", value: "", required: true },
        { id: "f5", label: "Gender", value: "", section: "Voluntary Self Identify", required: true },
        { id: "f6", label: "Last Name", value: "Already entered", userEntered: true, required: true },
      ],
    });

    expect(plan.autofill.map((row) => row.fieldId)).toEqual(["f1", "f2"]);
    expect(plan.missing).toEqual([
      { fieldId: "f3", label: "Salary Expectation", reason: "missing_profile_value" },
      { fieldId: "f4", label: "Custom Question #1", reason: "custom_question" },
    ]);
  });
});

describe("createWorkdayTrackerEntry", () => {
  it("builds a submitted tracker row with workday metadata", () => {
    expect(
      createWorkdayTrackerEntry({
        company: " Acme Corp ",
        role: " Senior Engineer ",
        reqId: "REQ-123",
        now: new Date("2026-04-13T10:00:00.000Z"),
      }),
    ).toEqual({
      company: "Acme Corp",
      role: "Senior Engineer",
      reqId: "REQ-123",
      ats: "workday",
      dateApplied: "2026-04-13T10:00:00.000Z",
      status: "submitted",
      source: "browser_autofill",
    });
  });
});
