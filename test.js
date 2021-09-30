const TemplateClient = require('./lib/TemplateClient/TemplateClient');

const client = new TemplateClient();

let matrikkelContext = client.getTemplate('matrikkelContext.xml');

console.log(client.hasDefaultValues(matrikkelContext));
matrikkelContext = client.fillDefaultValues();
console.log(client.hasDefaultValues(matrikkelContext));
