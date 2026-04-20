const cds = require('@sap/cds');

module.exports = class StudentService extends cds.ApplicationService {
  async init() {
    const { Students, Courses, Enrollments } = this.entities;

    // ─── enrollStudent Action ─────────────────────────────────────────────
    this.on('enrollStudent', async (req) => {
      const { studentId, courseId, semester } = req.data;

      // Verify student exists
      const student = await SELECT.one.from(Students).where({ ID: studentId });
      if (!student) return req.reject(404, `Student ${studentId} not found`);

      // Verify course exists
      const course = await SELECT.one.from(Courses).where({ ID: courseId });
      if (!course) return req.reject(404, `Course ${courseId} not found`);

      // Check if already enrolled
      const existing = await SELECT.one.from(Enrollments).where({
        student_ID: studentId,
        course_ID: courseId,
        semester: semester,
      });
      if (existing) {
        return `${student.firstName} ${student.lastName} is already enrolled in ${course.name} for ${semester}.`;
      }

      // Create enrollment
      await INSERT.into(Enrollments).entries({
        student_ID: studentId,
        course_ID: courseId,
        semester: semester,
      });

      return `Successfully enrolled ${student.firstName} ${student.lastName} in ${course.name} for ${semester}.`;
    });

    // ─── setAcademicProbation Action ──────────────────────────────────────
    this.on('setAcademicProbation', async (req) => {
      const { minGPA } = req.data;

      const studentsBelow = await SELECT.from(Students).where`gpa < ${minGPA} and status != 'probation'`;

      if (studentsBelow.length === 0) {
        return `No students found with GPA below ${minGPA} that aren't already on probation.`;
      }

      const ids = studentsBelow.map((s) => s.ID);
      await UPDATE(Students).set({ status: 'probation' }).where({ ID: { in: ids } });

      const names = studentsBelow.map((s) => `${s.firstName} ${s.lastName} (GPA: ${s.gpa})`);
      return `Set ${studentsBelow.length} student(s) on academic probation:\n${names.join('\n')}`;
    });

    // ─── getStatistics Function ──────────────────────────────────────────
    this.on('getStatistics', async () => {
      const totalStudents = await SELECT.from(Students).columns('count(*) as count');
      const totalCourses = await SELECT.from(Courses).columns('count(*) as count');
      const totalEnrollments = await SELECT.from(Enrollments).columns('count(*) as count');
      const avgGPA = await SELECT.from(Students).columns('avg(gpa) as avgGpa');
      const probationCount = await SELECT.from(Students)
        .where({ status: 'probation' })
        .columns('count(*) as count');

      return JSON.stringify({
        totalStudents: totalStudents[0]?.count || 0,
        totalCourses: totalCourses[0]?.count || 0,
        totalEnrollments: totalEnrollments[0]?.count || 0,
        averageGPA: Number(avgGPA[0]?.avgGpa || 0).toFixed(2),
        studentsOnProbation: probationCount[0]?.count || 0,
      });
    });

    await super.init();
  }
};
