const server = require('./server.js');
const tests = [
  '발급하다/발급',
  "'발급하다','발급'",
  '발급하다 / 발급',
  '발급하다／발급'
];
for (const s of tests) {
  console.log(JSON.stringify(s) + ' => ' + JSON.stringify(server.expectedVariants(s)));
}
