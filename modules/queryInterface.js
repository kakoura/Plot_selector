import config from '../data/config.json';
import Mustache from 'mustache';



function TextEngine(suggestPath, selectPath) {
	// inicialización de opciones
	const options = {
			method: 'GET',
			headers: {	'Content-Type': 'application/json'	}
		};
			
	// test 
	this.test = async function() {
		// pruebo las sugerencias
		//console.debug(suggestPath);
		const sug = await fetch(suggestPath, options);
		if (sug.ok) { // if HTTP-status is 200-299
			// fue bien, pruebo la selección
			//console.debug(selectPath);
			const sel = await fetch(selectPath, options);
			if (sel.ok)
				return Promise.resolve(true);
			else {
				// logging del error
				const mens = 'SOLR error - url: ' + selectPath
					+ ' - code: ' + sel.status + ' - mens: ' + sel.statusText;
				// rechazo la promesa
				return Promise.reject(mens);				
			}		
		} 
		else {
			// logging del error
			const mens = 'SOLR error - url: ' + suggestPath
				+ ' - code: ' + sug.status + ' - mens: ' + sug.statusText;
			// rechazo la promesa
			return Promise.reject(mens);
		}
	}
	
	// petición sugerencias
	this.getSuggestions = async function(input) {
		// preparo la url de la petición
		const url = suggestPath + Mustache.render(config.solrConfig.suggestTemplate, {'input': input} );
		// hago petición
		const datos = await this.getData(url);
		return datos;
	}
	
	// petición documento
	this.getDocument = async function(id) {
		// preparo la url de la petición
		const url = selectPath + Mustache.render(config.solrConfig.selectTemplate, {'id': id} );
		// hago petición
		const datos = await this.getData(url);			
		return datos;
	}
	
	this.getData = async function(url) {
		// hago log de la url
		//console.debug(url);
		// hago la petición
		const response = await fetch(url, options);
		if (response.ok) { // if HTTP-status is 200-299
			// petición exitosa
			const datos = await response.json();
			// devuelvo los datos
			return Promise.resolve(datos);		
		} else  { // logging del error
			const eobj = {
				status: response.status,
				url: url,
				mens: 'SOLR error - url: ' + url
				+ ' - code: ' + response.status + ' - mens: ' + response.statusText
			};
			// rechazo la promesa
			return Promise.reject(eobj);
		}	
	}	
};





function CraftsAPI(craftsConfig) {
	// inicialización de opciones
	const options = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': craftsConfig.auth
			}
	};  

	// test 
	this.test = async function() {
		// ajusto método
		options.method = 'GET';
		// hago log de la url de prueba
		console.debug(craftsConfig.api);
        // console.log(craftsConfig.api);

		const response = await fetch(craftsConfig.api, options);
        
		if (response.ok) // if HTTP-status is 200-299
			return Promise.resolve(true);
		else  {
			// logging del error
			// leo la respuesta del error
			const resperr = await response.json();
			const eobj = {
				message: 'CRAFTS error: ' + resperr.message,
				error: {
					url: craftsConfig.api,
					status: response.status,
					statusText: response.statusText			
				}
			};
			// rechazo la promesa
			return Promise.reject(eobj);
		}
	}
	
	// petición tipo GET de CRAFTS
	this.getData = async function(template, objpars) {
		// ajusto método y body
		options.method = 'GET';
		delete options.body;
		// preparo la url de la petición
		const url = craftsConfig.api + Mustache.render(template, objpars);
		// console.log(url);
		// hago log de la url
		console.debug(url);
		// info para GA
		//addEventData('crafts_reqs', 1);	// TODO
		// hago la petición
		
		const response = await fetch(url, options);
		if (response.ok) { // if HTTP-status is 200-299
			// petición exitosa
			const datos = await response.json();
			// devuelvo los datos
			return Promise.resolve(datos);		
		} else  { // logging del error
			// leo la respuesta del error
			const resperr = await response.json();
			const eobj = {
				message: 'CRAFTS error: ' + resperr.message,
				error: {
					url: url,
					status: response.status,
					statusText: response.statusText			
				}
			};
			// rechazo la promesa
			return Promise.reject(eobj);
		}
	}
}

export { CraftsAPI, TextEngine};