/*
   Import dependencies
*/
const fetch = require('node-fetch')
const xml2js = require('xml2js')                                   // For converting XML to JSON
const prettifyXml = require('prettify-xml');                          // For beutifying the XML request after generating
const TemplateClient = require('../TemplateClient/TemplateClient');   // Class for handeling templates

class MatrikkelClient {
  constructor (username, password, endpoint) {
    this.username = username;
    this.password = password;
    this.endpoint = endpoint;
  }

  // Prettifyes XML output
  prettifyXML (xml) {
    if (!xml) { return ''; }

    const options = {
      indent: 2,
      newline: '\n'
    }

    return prettifyXml(xml, options);
  }

  // Makes the request to the Kartverket Matrikkel SOAP API
  async makeRequest (req, body) {
    // Input validation
    if (!body) {
      throw new Error('makeRequest: body cannot be empty')
    }
    // Fix MatrikkelContext
    body = TemplateClient.replacePlaceholder(body, { CONTEXT: req.matrikkelContext });

    // Prettify the request body
    body = this.prettifyXML(body);

    // Define the body
    const fetchRequest = {
      method: 'POST',
      cache: 'no-cache',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        Host: 'prodtest.matrikkel.no:443',
        Authorization: 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
      },
      body: body
    }

    // Make the request
    const response = await fetch(this.endpoint, fetchRequest);

    // // Retreive the response body
    let responseBody = await response.text();
    responseBody = await xml2js.parseStringPromise(responseBody);

    return responseBody;
  }

  async getMatrikkelPolygon (req, polygon) {
    // Input validation
    if (!polygon) { return; }

    const requestTemplate = TemplateClient.getTemplate('findMatrikkelenheterPolygon.xml');

    let coordinatesString = '';
    polygon.forEach((p) => {
      let item = TemplateClient.getTemplate('geomPolygon.xml');
      item = TemplateClient.replacePlaceholder(item, { X: p.x, Y: p.y });
      item = TemplateClient.fillDefaultValues(item);
      coordinatesString += item;
    })

    const requestBody = TemplateClient.replacePlaceholder(requestTemplate, { COORDINATES: coordinatesString, KOORDINATSYSTEMID: 24 });

    return await this.makeRequest(req, requestBody);
  }
}

module.exports = MatrikkelClient;
