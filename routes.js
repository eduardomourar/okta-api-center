
var bodyParser = require("body-parser")

var fs = require("fs")

const OktaJwtVerifier = require('@okta/jwt-verifier')

var request = require("request")

var session = require("express-session")

//*******************************************/

const oktaJwtVerifier = new OktaJwtVerifier({
	issuer: CONFIG.OKTA_AZ_SERVER_ISSUER
})

module.exports = function (app) {

	app.get('/', function(req, res, next) {

		fs.readFile('./html/index.html', 'utf8', (error, page) => {

			evaluate_vars(page, (error, page) => {
				if (error) { throw new Error(error) }

				res.send(page)

			})
		})
	})

	app.post('/getAccessToken', function(req, res, next) {
		var code = req.body.code;

		console.log("the authorization code is: " + code);

		// exchange the authorization code
		// for an access token

		var options = {
			method: 'POST',
			url: CONFIG.OKTA_AZ_SERVER_ISSUER + "/v1/token",
			qs: {
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: CONFIG.REDIRECT_URI
			},
			headers: {
				'cache-control': 'no-cache',
				authorization: 'Basic ' + getBasicAuthString(),
				'content-type': 'application/x-www-form-urlencoded'
			}
		}

		request(options, function (error, response, body) {
			if (error) throw new Error(error);

			console.log(body);

			var obj = JSON.parse(body);

			if (obj.hasOwnProperty("access_token")) {
				req.session.access_token = obj.access_token;
				console.log("the access token is: " + req.session.access_token);
			}
			if (obj.hasOwnProperty("id_token")) {
				req.session.id_token = obj.id_token;
			}

			var response_to_browser = {}

			response_to_browser.access_token = obj.access_token
			response_to_browser.id_token = obj.id_token

			oktaJwtVerifier.verifyAccessToken(obj.id_token)
			.then(jwt => {
				response_to_browser.id_token_decoded = jwt.claims
				console.log(jwt.claims)

				oktaJwtVerifier.verifyAccessToken(obj.access_token)
				.then(jwt => {
					response_to_browser.access_token_decoded = jwt.claims

					console.log(jwt.claims)

					console.log("the response to the browser is: ")
					console.dir(response_to_browser)

					res.json(JSON.stringify(response_to_browser))
				})
				.catch(err => {
					console.log("something went wrong with the access_token validation")
					console.log(err)

				})
			})
			.catch(err => {
				console.log("something went wrong with the id_token validation")
				console.log(err)
			})
		})
	})

	app.post('/getData', function(req, res, next) {
		var endpoint = req.body.endpoint;

		console.log("the requested endpoint is: " + endpoint);

		console.log("the gateway is: " + req.body.gateway)

		console.log("the access_token token is: \n" + req.session.access_token + "\n");

		// send the access token to the requested API endpoint

		var url = CONFIG.PROXY_URI + "/" + req.body.endpoint

		console.log("the config file is: ")
		console.dir(CONFIG)

		var options = { method: 'GET',
			url: url,
			headers: {
				'cache-control': 'no-cache',
				authorization: "Bearer " + req.session.access_token,

				accept: 'application/json',
				'content-type': 'application/x-www-form-urlencoded'
			}
		}

		request(options, function (error, response, body) {
			if (error) throw new Error(error);

			console.log("******\nresponse from API gateway: ");

			console.log(body);

			res.json(body);
		});
	});

	function getBasicAuthString() {

		var x = CONFIG.AUTHN_CLIENT_ID + ":" + CONFIG.AUTHN_CLIENT_SECRET

		var y = new Buffer(x).toString('base64')

		return y
	}
}

function evaluate_vars(page, callback) {
	var regex
	for (var key in CONFIG) {
		regex = new RegExp('{{' + key + '}}', 'g')

		page = page.replace(regex, CONFIG[key])
	}
	return callback(null, page)
}