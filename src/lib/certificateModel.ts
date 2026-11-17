export interface CertificateStudent {
  identifier: string;
  approved?: boolean;
  percentage?: number | string | null;
}

export interface CertificateClass {
  id: number;
  title: string;
  course_title?: string | null;
  is_subcourse?: boolean;
}

export function summarizeCertificateEligibility(students: CertificateStudent[]) {
  const approved = students.filter(student => student.approved);
  return {
    total: students.length,
    approved: approved.length,
    pending: students.length - approved.length,
    approvedStudents: approved,
  };
}

export function groupCertificateClasses(classes: CertificateClass[]) {
  return classes.reduce<Array<{ title: string; classes: CertificateClass[] }>>((groups, classItem) => {
    const title = classItem.is_subcourse ? (classItem.course_title || 'Subcurso') : 'Conteúdo principal';
    let group = groups.find(item => item.title === title);
    if (!group) {
      group = { title, classes: [] };
      groups.push(group);
    }
    group.classes.push(classItem);
    return groups;
  }, []);
}
