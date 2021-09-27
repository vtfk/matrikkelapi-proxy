/*
   Import dependencies
*/
const fetch = require('node-fetch')
const fs = require('fs');                          // Used for retreiving templates
const path = require('path');                      // Used for joining file paths
const xml2js = require('xml2js')                   // For converting XML to JSON
const prettifyXml = require('prettify-xml');       // For beutifying the XML request after generating

// MatrikkelContext is information that will have to be sent with every request to the MatikkelAPI
const matrikkelContext = `
    <dom:locale>no_NB</dom:locale>
    <dom:brukOriginaleKoordinater>false</dom:brukOriginaleKoordinater>
    <dom:koordinatsystemKodeId>
        <dom:value>24</dom:value>
    </dom:koordinatsystemKodeId>
    <dom:systemVersion>trunk</dom:systemVersion>
    <dom:klientIdentifikasjon>VTFK-test</dom:klientIdentifikasjon>
`

/*
  replacePlaceholder
  Replaces placeholders in a string
*/
function replacePlaceholder (data, placeholder, value, placeHolderStart = '{{', placeHolderEnd = '}}') {
  // Input validation
  if (!data) { return }
  if (!placeholder || !value) { return data }

  // This is to make sure the input is escaped and safe
  function escapeRegExp (string) {
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }

  // Replace the placeholders and return the result
  return data.replace(new RegExp(escapeRegExp(placeHolderStart + placeholder + placeHolderEnd), 'g'), value);
}

class MatrikkelClient {
  constructor (username, password, endpoint) {
    this.username = username;
    this.password = password;
    this.endpoint = endpoint;
  }

  prettifyXML (xml) {
    if (!xml) { return ''; }

    const options = {
      indent: 2,
      newline: '\n'
    }

    return prettifyXml(xml, options);
  }

  async makeRequest (body) {
    // Input validation
    if (!body) {
      throw new Error('makeRequest: body cannot be empty')
    }
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

    // Retreive the response body
    let responseBody = await response.text();
    responseBody = await xml2js.parseStringPromise(responseBody);

    return responseBody;
  }

  async getTemplate (name) {
    if (!name) { return undefined; }

    let fullFileName = name;
    if (!name.toLowerCase().endsWith('.xml')) {
      fullFileName = name + '.xml';
    }

    const fullFilePath = path.resolve(__dirname, 'templates/', fullFileName);

    if (!fs.existsSync(fullFilePath)) {
      throw new Error('Template could not be found at location: ' + fullFilePath);
    }

    const fileData = fs.readFileSync(fullFilePath, { encoding: 'utf-8' });

    return fileData;
  }

  async getMatrikkelPolygon (polygon) {
    // Input validation
    if (!polygon) { return; }

    // Template for item
    const itemTemplate = `
            <geom:item>
                <geom:x>{{X}}</geom:x>
                <geom:y>{{Y}}</geom:y>
                <geom:z>0</geom:z>
            </geom:item>`

    const requestTemplate = await this.getTemplate('findMatrikkelenheterPolygon');

    let coordinatesString = '';
    polygon.forEach((p) => {
      let item = itemTemplate;
      item = replacePlaceholder(item, 'X', p[0]);
      item = replacePlaceholder(item, 'Y', p[1]);
      coordinatesString += item;
    })

    let requestBody = await replacePlaceholder(requestTemplate, 'COORDINATES', coordinatesString);
    requestBody = await replacePlaceholder(requestBody, 'CONTEXT', matrikkelContext);

    return await this.makeRequest(requestBody);
  }
}

module.exports = MatrikkelClient;
