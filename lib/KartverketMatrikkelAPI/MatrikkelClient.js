/*
   Import dependencies
*/
const fetch = require('node-fetch')
const fs = require('fs');                          // Used for retreiving templates
const path = require('path');                      // Used for joining file paths
const xml2js = require('xml2js')                   // For converting XML to JSON
const prettifyXml = require('prettify-xml');       // For beutifying the XML request after generating
const util = require('util');


const matrikkelContext = `
    <dom:locale>no_NB</dom:locale>
    <dom:brukOriginaleKoordinater>false</dom:brukOriginaleKoordinater>
    <dom:koordinatsystemKodeId>
        <dom:value>24</dom:value>
    </dom:koordinatsystemKodeId>
    <dom:systemVersion>trunk</dom:systemVersion>
    <dom:klientIdentifikasjon>VTFK-test</dom:klientIdentifikasjon>
`

function replacePlaceholder(data, placeholder, value) {
    // Input validation
    if(!data) { return }
    if(!placeholder || !value) { return data }

    return data.replaceAll('{{' + placeholder + '}}', value)
}

class MatrikkelClient {
   constructor(username, password, endpoint) {
      this.username = username;
      this.password = password;
      this.endpoint = endpoint;
   }

   prettifyXML(xml) {
      if(!xml) { return ''; }

      const options = {
         indent: 2,
         newline: '\n'
      }

      return prettifyXml(xml, options);
   }

   async #makeRequest(body) {
      return new Promise(async (resolve, reject) => {
         // Prettify the request body
         body = this.prettifyXML(body);

         // Define the body
         let fetchRequest = {
            method: 'POST',
            cache: 'no-cache',
            redirect: 'follow',
            headers: {
               'Content-Type': 'text/xml;charset=UTF-8',
               'Access-Control-Allow-Origin': '*',
               'Host': 'prodtest.matrikkel.no:443',
               'Authorization': 'Basic ' + btoa(this.username + ":" + this.password)
            },
            body: body
         }

         // Make the request
         let response = await fetch(this.endpoint, fetchRequest);

         // Retreive the response body
         let responseBody = await response.text();
         // resposeBody = this.prettifyXML(resposeBody);
         responseBody = await xml2js.parseStringPromise(responseBody);
         // responseBody = JSON.stringify(responseBody, null, 4);
         console.log(responseBody);

         resolve(responseBody);
      })
   }

   async getTemplate(name) {
      if(!name) { return undefined; }

      const templatePath = './templates/';

      let fullFileName = name;
      if(!name.toLowerCase().endsWith('.xml')) {
         fullFileName = name + '.xml';
      }

      const fullFilePath = path.join(templatePath, fullFileName);

      if(!fs.existsSync(fullFilePath)) {
         throw 'Template @ "' + fullFilePath + '" could not be found';
      }

      return fs.readFileSync('./templates/' + name + '.xml');
   }

    async getMatrikkelPolygon(polygon) {
        // Input validation
        if(!polygon) { return; }

        // Template for item
        let itemTemplate = `
            <geom:item>
                <geom:x>{{X}}</geom:x>
                <geom:y>{{Y}}</geom:y>
                <geom:z>0</geom:z>
            </geom:item>`

        // Request template
   //      let requestTemplate = `
   //      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:mat="http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/service/matrikkelenhet" xmlns:mat1="http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/matrikkelenhet" xmlns:geom="http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain/geometri" xmlns:dom="http://matrikkel.statkart.no/matrikkelapi/wsapi/v1/domain">
   //      <soapenv:Header/>
   //      <soapenv:Body>
   //         <mat:findMatrikkelenheter>
   //            <mat:matrikkelenhetsokModel>
   //               <mat1:selectionPolygon>
   //                  <geom:polygon>
   //                     <geom:koordinatsystemKodeId>
   //                        <dom:value>24</dom:value>
   //                     </geom:koordinatsystemKodeId>
   //                     <geom:ytreAvgrensning>
   //                        <geom:positions>
   //                           {{COORDINATES}}
   //                        </geom:positions>
   //                     </geom:ytreAvgrensning>
   //                  </geom:polygon>
   //                  <geom:koordinatsystemKodeId>
   //                     <dom:value>24</dom:value>
   //                  </geom:koordinatsystemKodeId>
   //               </mat1:selectionPolygon>
   //            </mat:matrikkelenhetsokModel>
   //            <mat:matrikkelContext>
   //               {{CONTEXT}}
   //            </mat:matrikkelContext>
   //         </mat:findMatrikkelenheter>
   //      </soapenv:Body>
   //   </soapenv:Envelope>`

      let requestTemplate = this.getTemplate('findMatrikkelenheterPolygon');

      let coordinatesString = '';
      polygon.forEach((p) => {
         let item = itemTemplate;
         item = replacePlaceholder(item, 'X', p[0]);
         item = replacePlaceholder(item, 'Y', p[1]);
         coordinatesString += item;
      })

      let requestBody = replacePlaceholder(requestTemplate, 'COORDINATES', coordinatesString)
      requestBody = replacePlaceholder(requestBody, 'CONTEXT', matrikkelContext);

      return await this.#makeRequest(requestBody);
    }
}

module.exports = MatrikkelClient;