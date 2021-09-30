/*
    Import dependencies
*/
const TemplateClient = require('../lib/TemplateClient/TemplateClient');

/*
    Tests
*/
test('No templates are available', () => {
  const data = TemplateClient.listTemplates();
  expect(data.length).toBeGreaterThan(0);
})

test('Exception thrown when template does not provided', () => {
  const fn = () => TemplateClient.getTemplate();
  expect(fn).toThrow();
})

test('Exception thrown when template does not exist', () => {
  const fn = () => TemplateClient.getTemplate('denneFinnesIkke.asd');
  expect(fn).toThrow();
})

describe('Load all templates', () => {
  test.each(TemplateClient.listTemplates())('Template %p can be loaded', (template) => {
    const fn = () => { TemplateClient.getTemplate(template); }
    expect(fn).not.toThrow();
  })
})

describe('Replace all default values in templates', () => {
  test.each(TemplateClient.listTemplates())('Default values %p can be resolved', (template) => {
    let t = TemplateClient.getTemplate(template);
    t = TemplateClient.fillDefaultValues(t);
    const result = TemplateClient.hasDefaultValues(t);
    expect(result).not.toBeTruthy();
  })
})
