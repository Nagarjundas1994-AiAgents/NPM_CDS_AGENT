using university from '../db/schema';

service StudentService {
  entity Students    as projection on university.Students;
  entity Courses     as projection on university.Courses;
  entity Enrollments as projection on university.Enrollments;

  // ─── Unbound Actions ──────────────────────────────────────────────────────
  // These are service-level operations that don't target a specific entity instance.

  /** Enroll a student in a course for a given semester. */
  action enrollStudent(
    studentId : UUID,
    courseId   : UUID,
    semester  : String
  ) returns String;

  /** Set academic probation for all students below the given GPA threshold. */
  action setAcademicProbation(
    minGPA : Decimal
  ) returns String;

  // ─── Unbound Functions ────────────────────────────────────────────────────

  /** Get summary statistics about the university. */
  function getStatistics() returns String;
}
