/**
 * src/lib/assignmentHelpers.ts
 * Single Source of Truth for Class Matching, Course Matching, and Report Calculations.
 */

/**
 * Checks whether a class_name value represents "All Classes" / General / Unrestricted.
 */
export function isAllClassesValue(className: string | null | undefined): boolean {
  if (!className || className.trim() === '') return true;
  const norm = className.trim().toLowerCase();
  return (
    norm === 'all' ||
    norm === 'all_classes' ||
    norm === 'semua' ||
    norm === 'semua kelas' ||
    norm === 'umum' ||
    norm === 'umum (semua kelas)' ||
    norm === 'global'
  );
}

/**
 * Determines if an assignment is applicable to a specific student's class.
 */
export function isAssignmentApplicableToClass(
  assignmentClassName: string | null | undefined,
  studentClassName: string | null | undefined
): boolean {
  // If assignment has no target class or is designated for all classes, it applies to everyone
  if (isAllClassesValue(assignmentClassName)) {
    return true;
  }

  // If student has no enrolled class, they cannot match a class-specific assignment
  if (!studentClassName || studentClassName.trim() === '') {
    return false;
  }

  const normAsg = assignmentClassName!.trim().toLowerCase();
  const normStudent = studentClassName.trim().toLowerCase();

  if (normAsg === normStudent) {
    return true;
  }

  // Handle delimiter-separated multiple classes (e.g. "01SIFP005, 01SIFP006" or "01SIFP005 / 01SIFP006")
  const classesList = normAsg.split(/[,;/|]+/).map(c => c.trim()).filter(Boolean);
  return classesList.includes(normStudent);
}

/**
 * Determines if an assignment belongs to a given course.
 */
export function isAssignmentBelongingToCourse(assignment: any, course: any): boolean {
  if (!assignment || !course) return false;

  const courseUuid = String(course.id || course.courseUuid || course.course_id || '').toLowerCase().trim();
  const courseCode = String(course.code || course.courseCode || course.courseId || '').toLowerCase().trim();

  const asgCourseId = String(assignment.course_id || assignment.courseId || '').toLowerCase().trim();
  const asgCourseCode = String(assignment.course?.code || assignment.courseCode || '').toLowerCase().trim();
  const asgCourseUuid = String(assignment.course?.id || '').toLowerCase().trim();

  const matchUuid = courseUuid !== '' && (asgCourseId === courseUuid || asgCourseUuid === courseUuid);
  const matchCode = courseCode !== '' && (asgCourseId === courseCode || asgCourseCode === courseCode);

  return Boolean(matchUuid || matchCode);
}

/**
 * Normalizes any URL, ensuring it has http:// or https://.
 * Trims whitespace. If no protocol is provided, defaults to https://.
 */
export function normalizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Checks if a URL or text is a Google Drive / Google Docs link.
 */
export function isGoogleDriveUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const normalized = normalizeUrl(url).toLowerCase();
  return (
    normalized.includes('drive.google.com') ||
    normalized.includes('docs.google.com') ||
    normalized.includes('sheets.google.com') ||
    normalized.includes('slides.google.com') ||
    normalized.includes('forms.google.com')
  );
}

/**
 * Validates whether a string can be parsed as a valid HTTP/HTTPS URL.
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

