const TemplateClient = require('./lib/TemplateClient/TemplateClient');

const client = new TemplateClient();

let matrikkelContext = client.getTemplate('matrikkelContext.xml');

// console.log('Unmodified');
console.log(client.hasDefaultValues(matrikkelContext));
matrikkelContext = client.fillDefaultValues();
console.log(client.hasDefaultValues(matrikkelContext));
// console.log('');
// console.log('After replacing:');
// // matrikkelContext = templateClient.replacePlaceholder(matrikkelContext, replaceObject)
// matrikkelContext = templateClient.fillDefaultValues(matrikkelContext);
// console.log(matrikkelContext);
