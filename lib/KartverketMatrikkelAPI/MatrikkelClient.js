/*
   Import dependencies
*/
const fetch = require('node-fetch')
const xml2js = require('xml2js')                                      // For converting XML to JSON
const _ = require('lodash');
const prettifyXml = require('prettify-xml');                          // For beutifying the XML request after generating
const TemplateClient = require('../TemplateClient/TemplateClient');   // Class for handeling templates

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

  getItemsFromJSONParsedXMLResponse (data) {
    const updatedData = JSON.parse(JSON.stringify(data));

    const responses = [];   // Array that contains all the responses

    // Get response body if exist
    const body = _.get(updatedData, 'Envelope.Body');
    if (!body) { return data; }  // The body was not found, just return the sent data

    // Foreach response/response type
    console.log('Responses');
    for (let bi = 0; bi < body.length; bi++) {
      let response = body[bi];
      const responseKey = Object.keys(response)[0];
      response = response[Object.keys(response)[0]];  // Set the response to be the first property of the object

      // Define the responseObject that contains returned items and namespaces
      const responseObject = {
        namespaces: [],
        items: []
      };
      if (responseKey.includes(':')) {
        responseObject.namespace_id = responseKey.split(':')[0];
        responseObject.type = responseKey.split(':')[1];
      }

      // Get the namespaces of the response
      const responseItems = response[0];
      if (responseItems.$) {
        const tmpNamespaces = responseItems.$;
        for (const obj in tmpNamespaces) {
          // Verify that the object is a namespace
          if (obj.startsWith('xmlns:')) {
            responseObject.namespaces.push({
              id: obj.split(':')[1],
              namespace: tmpNamespaces[obj]
            })
          }
        }
      }

      // Get all the values in the response
      const responseValues = responseItems[Object.keys(responseItems)[1]];
      if (responseValues) {
        for (let rvi = 0; rvi < responseValues.length; rvi++) {
          let valueGroup = responseValues[rvi];
          const valueGroupKey = Object.keys(valueGroup)[0];
          valueGroup = valueGroup[Object.keys(valueGroup)[0]];

          let valueGroupNamespaceId = '';
          let valueGroupType = '';

          // Get the namespace id and key
          if (valueGroupKey.includes(':')) {
            valueGroupNamespaceId = valueGroupKey.split(':')[0];
            valueGroupType = valueGroupKey.split(':')[1];
          }

          for (let i = 0; i < valueGroup.length; i++) {
            let value = valueGroup[i];

            const itemObject = {
              nsid: valueGroupNamespaceId,
              type: valueGroupType
            }

            if (typeof value === 'object') {
              if (Object.keys(value).length === 1) {
                value = value[Object.keys(value)[0]];
                if (Array.isArray(value) && value.length === 1) {
                  itemObject.value = value[0];
                } else {
                  itemObject.value = value;
                }
              }
            }

            // Resolve namespaces
            const matchedNamespace = responseObject.namespaces.filter((ns) => ns.id === itemObject.nsid)
            if (matchedNamespace && Array.isArray(matchedNamespace) && matchedNamespace.length > 0) {
              itemObject.namespace = matchedNamespace[0].namespace;
            }

            // Push to the array
            responseObject.items.push(itemObject);
          }
        }
      }

      // Add the response to the array
      responses.push(responseObject);
    }

    // Combine all the response items
    const responseItems = [];
    responses.forEach((response) => {
      responseItems.push(...response.items)
    });

    return responseItems;
  }

  simplifyParsedJSON(data) {
    // Input validation
    if(!data) { return; }
    if(!data.Envelope || !data.Envelope.Body) { return data; }

    // Variables
    let responses = [];

    /*
      Get the all the responses from the body
    */
    let body = data.Envelope.Body
    let _responses = [];
    if(!Array.isArray(body)) {
      _responses.push(body);
    } else {
      _responses = body;
    }

    /*
      Parse and get items from each response
    */
    for(let i = 0; i < _responses.length; i++) {
      // Response object that will be pushed to the responses array
      let response = {
        items: []
      }               
      let _response = _responses[i];  // Local working copy of the API returned response

      // Get the type and namespace
      let responseTagName = Object.keys(_response)[0];
      if(responseTagName.includes(':')) {
        response.namespaceid = responseTagName.split(':')[0];
        response.type = responseTagName.split(':')[1];
      }

      // Set the respons to be one level down, this is just for convenvience
      _response = _response[Object.keys(_response)[0]];

      // Attempt to retreive the namespaces used in this response
      let namespaces = [];
      if(_response['$'] && typeof _response['$'] === 'object') {
        for(let ns in _response['$']) {
          let namespace = {};
          if(ns.startsWith('xmlns')) {
            let split = ns.split(':');
            if(split.length <= 1) {
              namespace.id = 'default'
            } else {
              namespace.id = split[1];
            }
            namespace.namespace = _response['$'][ns];
            namespaces.push(namespace);
          }
        }
        if(namespaces.length > 1) {
          response.namespaces = namespaces;
        }
      }

      /*
        Items
      */
      let _itemGroups = [];
      let _items = [];
      let items = [];

      // Find the key where the items are stored
      let _itemsKey = Object.keys(_response).find((key) => key.includes('return'));
      if(!_itemsKey) { _itemsKey = Object.keys(_response).find((key) => key != '$'); }

      if(_itemsKey) {
        _itemGroups = _response[_itemsKey];
        if(!Array.isArray(_itemGroups)) { _itemGroups = [_itemGroups]; }
      }

      // Attempt to retreive all items
      for(let j = 0; j < _itemGroups.length; j++) {
        let _itemGroup = _itemGroups[j];
        let _itemKey = Object.keys(_itemGroup)[0];
        let _items = _itemGroup[Object.keys(_itemGroup)[0]];

        console.log(_itemKey);

        let item_key_namespace = undefined;
        let item_key_type = undefined;
        if(_itemKey.includes(':')) {
          item_key_namespace = _itemKey.split(':')[0];
          item_key_type = _itemKey.split(':')[1];
        }

        if(_items && !Array.isArray(_items)) { _items = [_items]; }

        for(let ii = 0; ii < _items.length; ii++) {
          let item = {};
          let item_xsi_namespace = '';
          let item_xsi_type = '';
          let _item = _items[ii];
          
          // Attempt to extract xsi type-information about the item if present
          if(_item['$'] && _item['$']['xsi:type']) {
            let type = _item['$']['xsi:type'];
            if(type.includes(':')) {
              item_xsi_namespace = type.split(':')[0];
              item_xsi_type = type.split(':')[1];
            }
          }
          
          // If the _item is just { value: 'something' }, extract the value
          if(Object.keys(_item).length == 1 && _item['value']) {
            _item = _item['value'];
          }

          item = {
            namespace_id: item_xsi_namespace || item_key_namespace,
            type: item_xsi_type || item_key_type,
            value: _item
          }

          let matchedNamespace = response.namespaces.find((ns) => ns.id == item.namespace_id);
          if(matchedNamespace && matchedNamespace.namespace) {
            item.namespace = matchedNamespace.namespace;
          }

          response.items.push(item);
        }
      }
      responses.push(response);
    }
    
    // Combine all the response items
    const responseItems = [];
    responses.forEach((response) => {
      responseItems.push(...response.items)
    });

    return responseItems
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
    // Retreive the response body
    let responseBody = await response.text();

    // Remove some uneccessary tag-info to make parsing easier
    responseBody = responseBody.replace(/<[a-zA-Z]:/g, '<');
    responseBody = responseBody.replace(/<\/[a-zA-Z]:/g, '</')

    // Try to parse the body as XML and convert it to JSON
    // If the request fails authentication with the MatrikkelAPI it will send back HTML for some reason.
    try {
      responseBody = await xml2js.parseStringPromise(responseBody, { explicitArray: false });
      try {
        let tmp = this.simplifyParsedJSON(responseBody);
        responseBody = tmp;
      }
      catch {}
      
      return responseBody;
    } catch (err) {
      throw new Error('Unable to parse response as XML. \n' + err)
    }
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
    body.forEach((item) => {
      // Find or register namespace
      let namespace = namespaces.find(ns => ns.namespace === item.namespace);
      if (!namespace) {
        namespaces.push({
          id: 'ns' + (namespaces.length + 1),
          namespace: item.namespace
        })
        namespace = namespaces[namespaces.length - 1];
      }

      // Generate item XML
      let itemTemplate = TemplateClient.getTemplate('storeServiceItem.xml');
      itemTemplate = TemplateClient.replacePlaceholder(itemTemplate, {
        TYPE: item.type,
        VALUE: item.value,
        NAMESPACEID: namespace.id
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
    requestTemplate = TemplateClient.replacePlaceholder(requestTemplate, {
      NAMESPACESTRING: namespaceString,
      ITEMS: itemsXML
    })

    return await this.makeRequest(req, requestTemplate);
  }
}

module.exports = MatrikkelClient;
