/*
   Import dependencies
*/
// const fetch = require('node-fetch')
const fs = require('fs');                          // Used for retreiving templates
const path = require('path');                      // Used for joining file paths
// const xml2js = require('xml2js')                   // For converting XML to JSON
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

  // Replaces a placeholder in the template
  replacePlaceholder (data, pairs, placeholderStart = '{{', placeholderEnd = '}}') {
    if (!data) { return }
    if (!pairs || !typeof pairs === 'object') { return data }

    let updatedData = JSON.parse(JSON.stringify(data));

    for (const key in pairs) {
      const fullplaceholder = placeholderStart + key + placeholderEnd;
      updatedData = updatedData.split(fullplaceholder).join(pairs[key]);
    }

    return updatedData;
  }

  // Makes the request to the Kartverket Matrikkel SOAP API
  async makeRequest (body) {
    // Input validation
    if (!body) {
      throw new Error('makeRequest: body cannot be empty')
    }
    // Fix MatrikkelContext
    body = this.replacePlaceholder(body, { CONTEXT: matrikkelContext });

    // Prettify the request body
    body = this.prettifyXML(body);

    // Define the body
    // const fetchRequest = {
    //   method: 'POST',
    //   cache: 'no-cache',
    //   redirect: 'follow',
    //   headers: {
    //     'Content-Type': 'text/xml;charset=UTF-8',
    //     'Access-Control-Allow-Origin': '*',
    //     Host: 'prodtest.matrikkel.no:443',
    //     Authorization: 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
    //   },
    //   body: body
    // }

    return body;

    // // Make the request
    // const response = await fetch(this.endpoint, fetchRequest);

    // // Retreive the response body
    // let responseBody = await response.text();
    // responseBody = await xml2js.parseStringPromise(responseBody);

    // return responseBody;
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
      item = this.replacePlaceholder(item, { X: p.x, Y: p.y });
      coordinatesString += item;
    })

    const requestBody = this.replacePlaceholder(requestTemplate, { COORDINATES: coordinatesString });

    return await this.makeRequest(requestBody);
  }
}

module.exports = MatrikkelClient;
