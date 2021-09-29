/*
    Import dependencies
*/
const TemplateClient = require('../lib/TemplateClient/TemplateClient');
const templateClient = new TemplateClient();

/*
    Tests
*/
test('No templates are available', () => {
  const data = templateClient.listTemplates();
  expect(data.length).toBeGreaterThan(0);
})

test('Exception thrown when template does not provided', () => {
  const fn = () => templateClient.getTemplate();
  expect(fn).toThrow();
})

test('Exception thrown when template does not exist', () => {
  const fn = () => templateClient.getTemplate('denneFinnesIkke.asd');
  expect(fn).toThrow();
})

describe('Load all templates', () => {
  test.each(templateClient.listTemplates())('Template %p can be loaded', (template) => {
    const fn = () => { templateClient.getTemplate(template); }
    expect(fn).not.toThrow();
  })
})

describe('Replace all default values in templates', () => {
  test.each(templateClient.listTemplates())('Default values %p can be resolved', (template) => {
    let t = templateClient.getTemplate(template);
    t = templateClient.fillDefaultValues(t);
    const result = templateClient.hasDefaultValues(t);
    expect(result).not.toBeTruthy();
  })
})
