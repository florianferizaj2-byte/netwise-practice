// One question keeps one identity and answer, with a classification per exam.
export function questionForCertificate(question, certificateId) {
  const scope = question?.certificateScopes?.[certificateId];
  return scope ? { ...question, ...scope } : question;
}
