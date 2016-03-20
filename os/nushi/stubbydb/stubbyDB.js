var util = require('./util/util');
var config = require("./configbuilder").getConfig();
var logger = require('./log');
var dbHandler = require('./dbset_handler');

function stubbyDB(){
	this.server = require('http').createServer();

	this.server.on('error', function(err) {
		var msg;
		switch (err.code) {
		    case 'EACCES':
		      msg = 'Permission denied for use of port ' + config.server.port;
		      break;
		    case 'EADDRINUSE':
		      msg = 'Port ' + config.server.port + ' is already in use.';
		      break;
		    case 'EADDRNOTAVAIL':
		      msg = 'Host "' + config.server.host + '" is not available.';
		      break;
		    default:
		      msg = err.message;
		}
		logger.error(msg);
		process.exit();
	});

	var reqResolver = require('./request_resolver');
	var resHandler = require('./response_handler');
	var color = require('./util/colors').color;
	var url = require('url');
	

	this.server.on('request', function(request, response) {
		var query = url.parse(request.url, true).query;
		var requestContext = '';
		if(query.debug){
			request.url = request.url.replace('debug=true','');
			if(request.url[request.url.length-1] == '?'){
				request.url = request.url.substr(0,request.url.length -1);
			}

			if(request.url == '/'){
				requestContext += "\nCurrent Script Directory: " + __dirname;
				requestContext += "\nConfiguration: " + JSON.stringify(config);
				requestContext += "\nProject path: " + global.basePath;
				var os = require('os');
				requestContext += "\nTotal memory: " + os.totalmem();
				requestContext += "\nFree memory: " + os.freemem();
				requestContext += "\nHost name: " + os.hostname();
			}
		}
		
		

		  var startTime = new Date();
		  var body = [];
		  request.on('error', function(err) {
		  	logger.error(msg);
		  }).on('data', function(chunk) {
		    body.push(chunk);
		  }).on('end', function() {
		    body = Buffer.concat(body).toString();
			request['post'] = body;


			requestContext += "\n--------------Original request----------------" ;
			requestContext += "\nURL: " + JSON.stringify(request.url);
			requestContext += "\nHeaders: " + JSON.stringify(request.headers);
			requestContext += "\nMethod: " + JSON.stringify(request.method);
			requestContext += "\nBody: " + JSON.stringify(request.post);
			requestContext += "\n----------------------------------------------" ;

			logger.info(request.method+": "+request.url,'success');
			try{
				var matchedEntry = reqResolver.resolve(request);
				
				requestContext += "\nMatched mapping: " + JSON.stringify(matchedEntry);

				if(matchedEntry == null){
					response.statusCode = 404;
					if(query.debug){
						response.end(requestContext);
					}else{
						response.end("");	
					}
					
					logger.error("Response served with Status Code " + response.statusCode);
					return;
				}
				

				logger.detailInfo("Matching Config: " + JSON.stringify(matchedEntry));
				
				resHandler.readResponse(matchedEntry,function(data,err){
					response = buildResponse(response,matchedEntry.response);
					requestContext += "\nRaw Response body: " + data;

					if(err == 404){
						response.statusCode = 404;
					}

					//1. replace DbSet Place Holders
					data = dbHandler.handle(data,matchedEntry.dbset);
					if(data instanceof Error){
						response.statusCode = 404;
						response.end("");
					}
					//2. replace request matches
					data = reqResolver.applyMatches(data,matchedEntry.request.matches);
					//3. replace markers
					data = require('./markers_handler').handle(data);
					//4. replace dumps
					data = require('./dumps_handler').handle(data);

					requestContext += "\nRefine Response Body: " + data;
					if(query.debug){
						response.end(requestContext);
					}else{
						response.write(data);
						response.end("");	
					}

					var responseTime = (new Date()) - startTime;
					if(response.statusCode == 200){
						logger.info("Response served in " + responseTime + " ms with Status Code " + response.statusCode,'success');
					}else{
						logger.info("Response served in " + responseTime + " ms with Status Code " + response.statusCode,'fail');
					}
				});
			}catch(e){
				logger.error(e);
				response.statusCode = 500;
				response.end("");
			}
		  });
	});

	this.server.listen(config.server.port,config.server.host, function(){
	    logger.info("Server listening on: http://" + config.server.host + ":" + config.server.port);
	});
}

function buildResponse(response,config){
	util.wait(config.latency);
	response.statusCode = config.status;
	if(config.headers){
		for(var header in config.headers){
			response.setHeader(header,config.headers[header]);
		}
		response.headers = config.headers;
	}

	return response;
}

module.exports = stubbyDB;