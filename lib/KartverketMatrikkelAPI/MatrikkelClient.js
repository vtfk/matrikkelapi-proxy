/*
   Import dependencies
*/
const fetch = require('node-fetch');                                  // For making the HTTP request to the Matrikkel API
const XmlReader = require('xml-reader');                              // Reads XML in a format that can be used by xml-query for working with the data
const xml2js = require('xml2js')                                      // For converting XML to JSON
const prettifyXml = require('prettify-xml');                          // For beutifying the XML request after generating
const TemplateClient = require('../TemplateClient/TemplateClient');   // Class for retreiving templates
const Sjablong = require('sjablong');                                 // Replace placeholders in templates
const WSDLClient = require('../WSDLClient/WSDLClient');               // Class for searching for type-information
const axios = require('axios');
const jwt = require('jsonwebtoken')                                   // For generating jwts to contact dsf
const pkg = require('../../package.json')
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` })    // Load different .env files based on NODE_ENV
const config = require('../../config');

async function getCompanyFromBrreg (orgnr) {
  if (!orgnr) return;
  const response = await axios.get(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`);
  return response.data;
}

// Gets a person from dsf
async function getPersonFromDsf (personnr) {
  const payload = {
    system: pkg.name,
    version: pkg.version
  }
  const options = {
    expiresIn: '1m',
    issuer: 'https://auth.vtfk.no'
  }
  const token = jwt.sign(payload, config.jwtSecret, options)

  const request = {
    method: 'POST',
    url: config.dsfAPIEndpoint,
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: {
      method: 'hentDetaljer',
      massLookup: true,
      query: {
        saksref: 'Masseutsendelse',
        foedselsnr: personnr
      }
    }
  }

  let response = await axios.request(request);
  let data = response.data;
  if(data.RESULT) data = data.RESULT;
  if(data.HOV) data = data.HOV;

  return data;
}

class MatrikkelClient {
  constructor (username, password, endpoint) {
    this.username = username;
    this.password = password;
    this.endpoint = endpoint;
  }

  /*
    Utility functions
  */
  // Prettifyes XML output
  prettifyXML (xml) {
    if (!xml) { return ''; }

    const options = {
      indent: 2,
      newline: '\n'
    }

    return prettifyXml(xml, options);
  }

  // Recursively makes a object as flat as possible
  static flattenObject (obj) {
    function flatten (current, currentKey, parent) {
      if (!current) { return; }

      if (currentKey === '$') { return; }

      // Delete metadata-fields
      if (currentKey === 'metadata') {
        delete parent[currentKey];
        return;
      }

      // Recursively go down all properties
      if (typeof current === 'object') {
        Object.keys(current).forEach((key) => {
          flatten(current[key], key, current);
        })
      }

      if (typeof current === 'object') {
        if (Object.keys(current).length === 1) {
          if (Object.keys(current)[0] !== '$') {
            parent[currentKey] = current[Object.keys(current)[0]];
          }
        } else if (Object.keys(current).length === 2 && current.$ !== undefined) {
          const key = Object.keys(current).find((k) => k !== '$');
          if (key) {
            if (typeof current[key] !== 'object') {
              parent[currentKey] = current[key];
            }
          }
        }
      }
    }

    const copy = JSON.parse(JSON.stringify(obj));

    Object.keys(copy).forEach((key) => {
      flatten(copy[key], key, copy);
    })

    return copy;
  }

  // Removes namespace information in front of the tag as it often gives wrong information
  static cleanUpXML (xml, full) {
    // Input validation
    if (!xml) { return; }

    // Remove some uneccessary tag-info to make parsing easier
    xml = xml.replace(/<[a-zA-Z]:/g, '<');
    xml = xml.replace(/<\/[a-zA-Z]:/g, '</')

    if (full) {
      xml = xml.replace(/<[a-zA-Z]+[0-9]+:/g, '<');
      xml = xml.replace(/<\/[a-zA-Z]+[0-9]+:/g, '</');
    }

    return xml;
  }

  /*
    Matrikkel spesifikt
  */
  // Resolve the response beefore sending
  async resolveRequest (rawXML, parsedJSON) {
    // Input validation
    if (!rawXML || !parsedJSON) {
      return parsedJSON;
    }

    // Make sure that all WSDLClients are loaded into memory
    WSDLClient.loadAllFiles();

    // Parse the XML using XML Reader - this is used for generating the type schemas
    const parsedXML = XmlReader.parseSync(rawXML)

    // Retreive all the XSI types in the XML data
    const xsiTypes = WSDLClient.findAllXsiTypesInXml(parsedXML);

    // Parse the XML to JSON - This will be modified with the generated schema and be returned to the caller
    let jsonBody = parsedJSON;
    if (parsedJSON && parsedJSON.Envelope && parsedJSON.Envelope.Body) {
      jsonBody = parsedJSON.Envelope.Body;
    }
    if (!Array.isArray(jsonBody)) { jsonBody = [jsonBody] }

    // Resolve and generate the schema for all the types
    if (xsiTypes) {
      xsiTypes.forEach((type) => {
        const resolved = WSDLClient.findElementTypeInOtherType(type.namespace, type.type);
        if (resolved) {
          type.schema = {
            _type: type.type,
            _namespace: type.namespace,
            ...resolved
          }
        }
      })
    }

    // Function for updating JSON-data with information in the generated schemas
    // This will have to be done from top to bottom
    const brreg = {}
    async function updateJSON (parent, parentKey, current, currentKey, schema, schemaKey, childIndex, level = 0) {
      if (!current) return;
      if (currentKey && currentKey === 'brreg') return;
      if (currentKey && currentKey === 'dsf') return;
      // Check if the current property has an specified xsi:type, if so attempt to change to a matching schema
      let xsiType;
      if (current.$ && current.$['xsi:type']) {
        xsiType = current.$['xsi:type'].split(':')[1];

        const tmpSchema = xsiTypes.find((type) => type.type === xsiType);
        if (tmpSchema && tmpSchema.schema) {
          schema = tmpSchema.schema;
        }
      }

      // Assume that the typeinformation is unresolved
      let schemaType = 'unresolved';
      let schemaNamespace = 'unresolved';

      // Check if the schema matches with the next level
      if (schema && currentKey !== schemaKey && schema[currentKey]) {
        schema = schema[currentKey];
      }

      if (schema) {
        schemaType = schema._type || 'unresolved';
        schemaNamespace = schema._namespace || 'unresolved';
      }

      // Check if Brreg should be contacted
      if (xsiType && xsiType === 'JuridiskPerson' && current.nummer) {
        // inspect(current);
        if (brreg[current.nummer]) current.brreg = brreg[current.nummer];
        else {
          try {
            brreg[current.nummer] = await getCompanyFromBrreg(current.nummer);
            current.brreg = brreg[current.nummer];
          } catch (err) {
            console.error(err);
          }
        }
      }

      let addedValue = false;
      if (typeof current === 'object') {
        current = {
          _type: schemaType,
          _namespace: schemaNamespace,
          ...current
        }
      } else {
        current = {
          _type: schemaType,
          _namespace: schemaNamespace,
          value: current
        }
        addedValue = true;
      }

      if (Array.isArray(parent[currentKey])) {
        parent[currentKey][childIndex] = current;
      } else {
        parent[currentKey] = current;
      }

      let childKeys = Object.keys(current).filter((key) => !key.startsWith('$'));
      if (addedValue) { childKeys = childKeys.filter((key) => key !== 'value') }
      for (const key of childKeys) {
        const nextSchema = schema && schema[key] ? schema[key] : undefined;
        if (!Array.isArray(current[key])) {
          await updateJSON(current, currentKey, current[key], key, nextSchema, key, 0, level + 1);
        } else {
          for (let i = 0; i < current[key].length; i++) {
            await updateJSON(current, currentKey, current[key][i], key, nextSchema, key, i, level + 1);
          }
        }
      }

      return current;
    }

    // Update the JSON data with schema information
    if (xsiTypes) {
      // For each response in the JSON body
      for (let i = 0; i < jsonBody.length; i++) {
        const response = jsonBody[i];
        // Get the name of the current respose
        const name = Object.keys(response)[0];
        // Get the data of the current respose
        const data = response[name];
        // Get all child-keys for the response
        const childKeys = Object.keys(data).filter((key) => !key.startsWith('$'));
        // Attempt to find a schema for the response type
        let schema = xsiTypes.find((type) => type.type === name);
        if (schema && schema.schema) { schema = schema.schema || undefined; }

        // Loop through all items in the response
        for (const key of childKeys) {
          const updatedData = await updateJSON(data, name, data[key], key, schema)
          if (updatedData) jsonBody[i] = updatedData;
        }
      }
    }

    // Return the JSON body
    return jsonBody;
  }

  // Resolve just the items that have specified xsi type
  async lightlyResolveRequest (rawXML, parsedJSON) {
    // Input validation
    if (!rawXML || !parsedJSON) { return }

    // Parse the XML using XML Reader - this is used for generating the type schemas
    const parsedXML = XmlReader.parseSync(rawXML)

    // Retreive all the XSI types in the XML data
    const xsiTypes = WSDLClient.findAllXsiTypesInXml(parsedXML);

    // Make a copy to not edit the source data
    let copy = JSON.parse(JSON.stringify(parsedJSON));

    // Make sure that the input if array
    if (!Array.isArray(copy)) { copy = [copy]; }

    // Function to recurively resolve the xsi-types
    const brreg = {}
    const dsf = {};
    async function lighlyResolve (item, key, parent) {
      if (!item) return;
      // Recursively check every child if array
      if (Array.isArray(item)) {
        for (let i = 0; i < item.length; i++) {
          await lighlyResolve(item[i], key, item)
        }
      }

      // Recursively check every property if present
      if (typeof item === 'object') {
        for (const key of Object.keys(item)) {
          await lighlyResolve(item[key], key, item);
        }
      }

      // Check for type information
      if (item.$ && item.$['xsi:type']) {
        let type = item.$['xsi:type'];
        if (type.includes(':')) {
          type = type.split(':')[1];
        }

        const updatedTypeinfo = {
          _type: type
        }

        // Contact brreg and add information to the company
        if (type === 'JuridiskPerson' && item.nummer) {
          if (brreg[item.nummer]) parent[key].brreg = brreg[item.nummer];
          else {
            try {
              brreg[item.nummer] = await getCompanyFromBrreg(item.nummer);
              item.brreg = brreg[item.nummer];
            } catch (err) {
              console.error(err);
            }
          }
        } else if (type === 'FysiskPerson' && item.nummer) {
          if (dsf[item.nummer]) parent[key].dsf = dsf[item.nummer];
          else {
            try {
              dsf[item.nummer] = await getPersonFromDsf(item.nummer);

              if(dsf[item.nummer]) {
                item.dsf = dsf[item.nummer];
                const spesCode = parseInt(dsf[item.nummer]['SPES-KD'])

                if(item.dsf.ADR.toLowerCase() === 'død') parent[key].dead = true;

                if(spesCode === 4 || spesCode === 6 || spesCode === 7 ) {
                  parent[key].manuallyHandle = true;
                  // Delete the matrikkel adress information
                  delete parent[key].postadresse;
                  delete parent[key].bostedsadresse;
                }
              }
            } catch (err) {
              console.error(err);
            }
          }
        }

        // Check for at match in the resolved xsi-types
        const xsiMatch = xsiTypes.find((t) => t.type === type);
        if (xsiMatch && xsiMatch.namespace) {
          updatedTypeinfo._namespace = xsiMatch.namespace;
        }

        // In try catch so it don't ruins the entire request if this somehow fails
        try {
          if (parent[key]) {
            parent[key] = {
              ...updatedTypeinfo,
              ...parent[key]
            }
          } else {
            parent = {
              ...updatedTypeinfo,
              ...parent
            }
          }
        } catch {}
      }

      // Attempt to strip away the '$' property if all necessary information has been retreived
      if (item.$ && item.$['xsi:type'] && Object.keys(item.$).length <= 2) {
        try {
          delete parent[key].$;
        } catch {}
      }

      return item;
    }

    // Resolve each item
    for (let item of copy) {
      item = await lighlyResolve(item, undefined, undefined);
    }

    return copy;
  }

  // Makes the request to the Kartverket Matrikkel SOAP API
  async makeRequest (req, body) {
    // Input validation
    if (!body) {
      throw new Error('makeRequest: body cannot be empty')
    }
    // Fix MatrikkelContext
    // body = Sjablong.replacePlaceholders(body, req.matrikkelContext);

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

    // Remove some uneccessary tag-info to make parsing easier
    responseBody = MatrikkelClient.cleanUpXML(responseBody);
    let cleanJSON = MatrikkelClient.cleanUpXML(responseBody, true);

    // The MatrikkelAPI returns status 200 and HTML if the request is unauthenticated or unauthorized, check for this as it will fail on the XML and JSON parsing below.
    const notOkContent = ['<!DOCTYPE HTML', '401 Unauthorized'];

    let errorMessage = '';
    notOkContent.forEach((phrase) => {
      if (responseBody.includes(phrase)) {
        errorMessage = 'The returned response from the Matrikkel API was invalid\r\nThe request might be unauthorized\r\n' + responseBody;
      }
    })
    if (errorMessage) throw new Error(errorMessage)

    // Parse the XML and convert it to JSON
    cleanJSON = await xml2js.parseStringPromise(cleanJSON, { explicitArray: false });

    // Attempt to find the JSON body
    if (cleanJSON && cleanJSON.Envelope && cleanJSON.Envelope.Body) {
      cleanJSON = cleanJSON.Envelope.Body;
    }

    // If resolve = true, do a full resolve of every part of the request
    // If not just lightly resolve by parsing found xsi-types and moving them to _type
    if (req.query.resolve) {
      const tmp = await this.resolveRequest(responseBody, cleanJSON);

      if (tmp) responseBody = tmp;
      else responseBody = cleanJSON;
    } else {
      cleanJSON = await this.lightlyResolveRequest(responseBody, cleanJSON);
      responseBody = cleanJSON;
    }

    if (!Array.isArray(responseBody)) { responseBody = [responseBody] }

    // Flatten the respons returning only the items
    if (req.query.flatten) {
      // This is the items that is returned under the envelope/boiler information
      const items = [];

      // Start by stripping away all metadata, boilerplate, etc. So we are left with only the data items
      for (let i = 0; i < responseBody.length; i++) {
        let response = responseBody[i];
        const firstProperty = response[Object.keys(response)[0]];

        // Find all items in the data
        if (response.item) {
          if (Array.isArray(response.item)) items.push(...response.item)
          else items.push(response.item)
        } else if (response.items) {
          if (Array.isArray(response.item)) items.push(...response.items)
          else items.push(response.items)
        } else if (firstProperty && firstProperty.return) {
          response = firstProperty;
          if (response.return && response.return.item) {
            if (Array.isArray(response.return.item)) {
              response.return.item.forEach((item) => {
                if (item.value && Object.keys(item).length === 1) items.push(item.value);
                else items.push(item);
              })
            } else {
              items.push(response.return.item);
            }
          }
        } else {
          items.push(response);
        }
      }

      // Then flatten all the reminding data
      const flattenedItems = [];
      items.forEach((item) => {
        flattenedItems.push(MatrikkelClient.flattenObject(item));
      })
      responseBody = flattenedItems;
    }

    return responseBody;
  }

  async getMatrikkelPolygon (req, polygon) {
    // Input validation
    if (!polygon) { return; }

    const requestTemplate = TemplateClient.getTemplate('findMatrikkelenheterPolygon.xml');

    let coordinatesString = '';
    polygon.forEach((p) => {
      const item = Sjablong.replacePlaceholders(TemplateClient.getTemplate('geomPolygon.xml'), p);
      coordinatesString += item;
    })

    const data = {
      koordinatsystemKodeId: 24,
      positions: coordinatesString,
      matrikkelContext: req.matrikkelContext
    }

    const requestBody = Sjablong.replacePlaceholders(requestTemplate, data);

    return await this.makeRequest(req, requestBody);
  }

  /*
    Store service
  */
  async callStoreService (req, body) {
    // Array for storing all the found namespaces in the request as well as an unique generated id
    const namespaces = [];
    let itemsXML = '';

    // Enumurate all items and do the following
    // 1. Find all unique namespaces and assign a ID to it
    // 2. Generate item XML from template
    body.items.forEach((item) => {
      // Find or register namespace
      let namespace = namespaces.find(ns => ns.namespace === item.namespace || ns.namespace === item._namespace);
      if (!namespace) {
        namespaces.push({
          id: 'ns' + (namespaces.length + 1),
          namespace: item.namespace || item._namespace
        })
        namespace = namespaces[namespaces.length - 1];
      }

      // Generate item XML
      let itemTemplate = TemplateClient.getTemplate('storeServiceItem.xml');
      itemTemplate = Sjablong.replacePlaceholders(itemTemplate, {
        namespaceId: namespace.id,
        itemType: item.type,
        itemValue: item.value
      })

      itemsXML += itemTemplate;
    })

    // Generate the namespace string
    let namespaceString = '';
    namespaces.forEach((ns) => {
      namespaceString += 'xmlns:' + ns.id + '="' + ns.namespace + '" ';
    })
    namespaceString += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';

    // Generate store request template
    let requestTemplate = TemplateClient.getTemplate('storeRequest.xml');
    requestTemplate = Sjablong.replacePlaceholders(requestTemplate, {
      namespaceString: namespaceString,
      items: itemsXML,
      matrikkelContext: req.matrikkelContext
    })

    return await this.makeRequest(req, requestTemplate);
  }
}

module.exports = MatrikkelClient;
