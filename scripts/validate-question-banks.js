import {
  banksForCertificate,
  bundledQuestions,
  certificates,
} from "../server/question-banks/loader.js";

const questions = bundledQuestions();
for (const certificate of certificates) {
  const count = questions.filter((q) =>
    q.certificates.includes(certificate.id),
  ).length;
  const banks = banksForCertificate(certificate.id);
  console.log(`${certificate.id}: ${count} questions, ${banks.length} banks`);
}
console.log(`Validated ${questions.length} unique bundled questions.`);
