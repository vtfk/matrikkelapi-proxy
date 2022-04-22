# matrikkelapi-proxy
A REST API that receives JSON requests, then translates and relays them as SOAP to the [Matrikkel API](https://kartkatalog.geonorge.no/metadata/matrikkelapi/51627b36-c619-4e6d-89ef-472cc248c1c4)

When a response is received it will convert the XML to JSON.

The full MatrikkelAPI has ***not*** been exposed through this API only what we have had the need for.

## Features
* Takes in JSON requests and relays as SOAP
* Translates the received SOAP response from the MatrikkeAPI to JSON
* Can flatten the response before returning as JSON. (Useful because the MatrikkelAPI returns a lot of its data with uneccessary deph, this makes the data easier to work with)
* **[Experimental]** Traverse all received data from the MatrikkelAPI and determine it's class types. (Important for store-queries, hard to figure out from the Matrikkel [documentation](https://prodtest.matrikkel.no/matrikkel/matrikkel.html)) This is experimental and will fail under certain conditions.

## Documentation
When hosting this project it will provide a Swagger UI documentation on http://**url**/api/v1/docs

## Environment variables
|Variable|Description|Example
|---|---|---|
| MATRIKKELAPI_BASEURL | The base url of the MatrikkelAPI | https://prodtest.matrikkel.no/
| MATRIKKELAPI_USERNAME | MatrikkelAPI username | The username received from Kartverket
| MATRIKKELAPI_PASSWORD | MatrikkelAPI password | The password received from Kartverket
| VTFK_DSFAPI_ENDPOINT | URL of the VTFK DSFAPI instance | https://someurl.no/dsf/v1/lookup
| VTFK_DSFAPI_SECRET | Secret for encoding the DSF request | Some passcode
| APIKEY1 | APIKey for accessing this API | Some API key
| APIKEY2 | APIKey for accessing this API | Some API key
| APIKEY# | APIKEY + number | Some API key | Some API key