namespace university;

entity Students {
  key ID             : UUID;
      firstName      : String(50)  @mandatory;
      lastName       : String(50)  @mandatory;
      email          : String(100) @mandatory;
      gpa            : Decimal(3,2);
      enrollmentDate : Date;
      status         : String(20) default 'active';  // active, probation, graduated, suspended
      courses        : Association to many Enrollments on courses.student = $self;
}

entity Courses {
  key ID         : UUID;
      name       : String(100) @mandatory;
      code       : String(10)  @mandatory;
      credits    : Integer;
      department : String(50);
      maxStudents: Integer default 30;
      students   : Association to many Enrollments on students.course = $self;
}

entity Enrollments {
  key ID       : UUID;
      student  : Association to Students;
      course   : Association to Courses;
      grade    : String(2);
      semester : String(20);
      year     : Integer;
}
