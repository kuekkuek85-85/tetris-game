import { describe, expect, it } from "vitest";
import { parseStudentId } from "./studentId";

describe("parseStudentId", () => {
  it("5자리 학번을 학년/반/번호로 파싱한다", () => {
    const r = parseStudentId("10203");
    expect(r.valid).toBe(true);
    expect(r.parsed).toEqual({ grade: 1, classNo: 2, studentNo: 3, classId: "1-2" });
  });

  it("반·번호 두 자리를 그대로 해석한다", () => {
    const r = parseStudentId("31125");
    expect(r.parsed).toEqual({ grade: 3, classNo: 11, studentNo: 25, classId: "3-11" });
  });

  it("5자리가 아니면 거부한다", () => {
    expect(parseStudentId("1234").valid).toBe(false);
    expect(parseStudentId("123456").valid).toBe(false);
    expect(parseStudentId("1a203").valid).toBe(false);
  });

  it("학년이 0이면 거부한다", () => {
    expect(parseStudentId("00102").valid).toBe(false);
  });
});
