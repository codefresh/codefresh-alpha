define([
    'orion/xhr',
    'orion/Deferred', 
	'jquery'
], function(xhr, Deferred, $) {

	var deployInfo = {};
	var deferred = new Deferred();
    
    $("#okbutton").click(function(){
    	 //if (data.pageService === "orion.page.delegatedUI" && data.source === options.id) 
    	 window.parent.postMessage(JSON.stringify({pageService: "orion.page.delegatedUI", 
			 source: "org.codefresh.amazon.deploy.uritemplate", 
			 status: 'done'}), "*");
    });
	deployInfo.getInfo = function(){
    xhr('GET', '/amazon/lastDeploy', {}).then(function(xhrResult) {
         deferred.resolve(xhrResult);

      });

   return deferred;
    }
    deployInfo.getInfo().then(function(data)
    	{
    		console.log("deployinfo" + JSON.stringify(data));
    		var app = JSON.parse(data.response);
           $("#messageArea").html("<a href='" + app.url + "' target='_parent'> http://" + app.url + "</a>");
    	});

 return deployInfo;

});
