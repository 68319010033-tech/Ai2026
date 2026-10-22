// Table definitions: column types, keys, which tables are optional, template examples.
// type: id | upper | text | int | day | time
export const TABLES = {
  groups: {
    required: true,
    columns: { group_id: 'id', program: 'upper', year_level: 'int', student_count: 'int' },
    optional: ['program', 'year_level'],
    key: ['group_id'],
    example: ['G01', 'DGB', '2', '28'],
  },
  teachers: {
    required: true,
    columns: { teacher_id: 'id', teacher_name: 'text', max_periods_per_day: 'int', max_periods_per_week: 'int' },
    key: ['teacher_id'],
    example: ['T01', 'Teacher-01', '6', '20'],
  },
  rooms: {
    required: true,
    columns: { room_id: 'id', room_name: 'text', room_type: 'upper', capacity: 'int' },
    key: ['room_id'],
    example: ['R01', 'Classroom-1', 'GENERAL', '35'],
  },
  courses: {
    required: true,
    columns: { course_id: 'id', course_name: 'text', required_room_type: 'upper', session_length: 'int', sessions_per_week: 'int' },
    key: ['course_id'],
    example: ['C101', 'Software Design', 'GENERAL', '2', '2'],
  },
  offerings: {
    required: true,
    columns: { offering_id: 'id', course_id: 'id', group_id: 'id', teacher_id: 'id', student_count: 'int' },
    optional: ['student_count'],
    key: ['offering_id'],
    example: ['O001', 'C101', 'G01', 'T01', '28'],
  },
  timeslots: {
    required: true,
    columns: { day: 'day', period: 'int', start_time: 'time', end_time: 'time' },
    key: ['day', 'period'],
    example: ['MON', '1', '08:00', '09:00'],
  },
  blocked_slots: {
    required: false,
    columns: { resource_type: 'upper', resource_id: 'id', day: 'day', period: 'int', reason: 'text' },
    optional: ['reason'],
    key: ['resource_type', 'resource_id', 'day', 'period'],
    example: ['TEACHER', 'T01', 'MON', '1', 'Outside duty'],
  },
  fixed_sessions: {
    required: false,
    columns: { offering_id: 'id', session_no: 'int', day: 'day', start_period: 'int', room_id: 'id' },
    key: ['offering_id', 'session_no'],
    example: ['O007', '1', 'TUE', '5', 'R08'],
  },
  students: {
    required: false,
    columns: { student_id: 'id', group_id: 'id' },
    key: ['student_id'],
    example: ['S01001', 'G01'],
  },
  enrollments: {
    required: false,
    columns: { student_id: 'id', offering_id: 'id' },
    key: ['student_id', 'offering_id'],
    example: ['S01001', 'O001'],
  },
};
export const TABLE_NAMES = Object.keys(TABLES);

// foreign keys: [table, column, refTable, refColumn]
export const FOREIGN_KEYS = [
  ['offerings', 'course_id', 'courses', 'course_id'],
  ['offerings', 'group_id', 'groups', 'group_id'],
  ['offerings', 'teacher_id', 'teachers', 'teacher_id'],
  ['students', 'group_id', 'groups', 'group_id'],
  ['enrollments', 'student_id', 'students', 'student_id'],
  ['enrollments', 'offering_id', 'offerings', 'offering_id'],
  ['fixed_sessions', 'offering_id', 'offerings', 'offering_id'],
  ['fixed_sessions', 'room_id', 'rooms', 'room_id'],
];
