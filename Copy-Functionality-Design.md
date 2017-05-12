#Functionality
* Copies one or more values from request fields into the response
* Tokenizes values from request using regex, jsonpath, and xpath
* **Value**: Simplifies dynamic behavior handling for more robust stubs

#Dependencies
* mountebank/src/models/behaviors.js

#High Level Development
* Developed function copy to handle one or multiple copied values from the request
* Developed function replace to replace tokenized value from request into the response
* Developed function getMatches to match on regex, jsonpath, and xmlpath from request
* Developed error handling of the API via addCopyFromErrors, addCopyIntoErrors, addCopyUsingErrors, addCopyErrors functions
* Interacts with functions regexValue, xpathValue, jsonpathValue, globalStringReplace
* Error functions interacts with validate function
* copyFn was added to execute function

#Example
```javascript
{
	"port": 3031,
	"protocol": "http",
	"name": "Copy",
	"stubs": [{
		"responses": [{
			"is": {
				"body": "<Response>\n\t<book>\n\t<query>QUERY</query>\n\t<body>BODY</body>\n\t<headers>HEADER</headers>\n\t<uripath>URI</uripath>\n\t</book>\n</Response>"
			},
			"_behaviors": {

				"copy": [{
						"from": "body",
						"into": "BODY",
						"using": {
							"method": "xpath",
							"selector": "//book/author/text()"
						}
					}, {
						"from": {
							"query": "first"
						},
						"into": "QUERY",
						"using": {
							"method": "regex",
							"selector": ".+"
						}
					}, {
						"from": {
							"headers": "Content-Type"
						},
						"into": "HEADER",
						"using": {
							"method": "regex",
							"selector": ".+"
						}
					}, {
						"from": "path",
						"into": "URI",
						"using": {
							"method": "regex",
							"selector": ".+"
						}
					}

				]

			}
		}]
	}]
}
```