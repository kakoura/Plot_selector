// Import config file
import config from './data/config.json';
import dict from './data/dictionary.json'
import countTreesPerTaxon_LZS from './data/countTreesPerTaxon_LZS.json';
import countTreesPerTaxonProv_LZS from './data/countTreesPerTaxonProv_LZS.json';
import countPlotsPerAllTaxonsProv_LZS from './data/countPlotsPerAllTaxonsProv_LZS.json';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

// Import map initialization function
import { initializeMap, Mimapa, mapaMovido,actualizarMapaBase} from './modules/map.js';
import { cargarBotonesMapa, cargarPanel} from './modules/mapControls.js';
import { string2loc, loc2string, getLiteral, expandPrefix, applyPrefix, configurarModal } from './modules/util.js';
import { CraftsAPI, TextEngine } from './modules/queryInterface.js';
import { updateHTMLtemplates } from './data/htmlTemplates.js';
import { renderEntradaLugares } from './modules/places.js';
import { getUsesInfo, getTaxonsInfo, getProvincesInfo,taxonsChange } from './modules/dataManager.js';
import { visualizarFiltrosTaxon } from './modules/taxons.js';
import { inicializarProvincias, ajustarColorProvincias, ajustarPopupsProvincias } from './modules/provinces.js';
import { inicializarTeselas, ajustarColorTeselas, ajustarPopupsTeselas } from './modules/patches.js';
import { ajustarColorParcelas, ajustarPopupsParcelas } from './modules/plots.js';
import { ajustarColorArboles, ajustarPopupsArboles } from './modules/trees.js';
import { generaIconos } from './modules/icons.js';
import L from 'leaflet';
import $ from "jquery";
import _ from 'underscore';
import bootstrap from "bootstrap/dist/js/bootstrap.bundle.min.js";
import LZString from 'lz-string';
// // Run map initialization when the page loads
// window.onload = function() {
//     initializeMap();
// };

//
let Sesion, Layers, Datos, Crafts, CachedQueries,Solr;

cargaInicialFicheros();

// CARGA INICIAL FICHEROS
async function cargaInicialFicheros() {
	// guardo aquí las consultas cacheadas
	CachedQueries = {};
	
	// cargamos las consultas cacheadas
	console.group("Precarga de ficheros");
	console.time("Carga de ficheros inicial");
	CachedQueries.countTreesPerTaxon = await JSON.parse( LZString.decompress(countTreesPerTaxon_LZS) );
	CachedQueries.countTreesPerTaxonProv = await JSON.parse( LZString.decompress(countTreesPerTaxonProv_LZS) );
	CachedQueries.countPlotsPerAllTaxonsProv = await JSON.parse( LZString.decompress(countPlotsPerAllTaxonsProv_LZS) );
	console.timeEnd("Carga de ficheros inicial");
	console.groupEnd();
	
	// vamos a la inicialización
	inicializar();
}


async function inicializar(){
    // INICIALIZACIÓN SESIÓN
	updateHTMLtemplates();

	// INICIALIZO Layers
	Layers = {};
	
	// INICIALIZACIÓN SESIÓN
	Sesion = {};

	// inicializo timeouts
	Sesion.timeout = config.timeout;
	Sesion.huboTimeout = false;	

	// bloqueo para pintar mapa
	Sesion.actualizandoMapa = false; // bloqueo si se está actualizando el mapa
	Sesion.mapaMovido = false; // detecto si el mapa se movió para actualizar
	Sesion.idTimeoutActualizar = null; // id del timeout para actualización automática (para que no se bloquee)
	
	// no está dibujando el polígono de descarga
	Sesion.poligonero = false;

	// estado de la sesión (construido a partir de la URL)
	Sesion.estado = {};		

	// inicialización zoom
	Sesion.zoom = undefined;
	Sesion.zoomUsados = {}; // guardo los zooms usados en el mapa para facilitar el cacheo

	// inicializo nombres científicos con el valor de nomci en local storage o false
	Sesion.nomci = localStorage.getItem('nomci') === "true"? true : false;

	// inicializo filtros de taxones
	Sesion.taxones = [];
	Sesion.taxonesColores = [];
	//Sesion.taxonesUsados = {}; // guardo los taxones usados en el mapa para facilitar el cacheo
	// inicializo sugerencias taxones 
	Sesion.taxonFocus = -1;
	
	// progreso y estadísticos
	Sesion.infoCeldas = {}; // no hace falta inicializar, pero así queda claro su uso
	//Sesion.infoBoxes = {};

	// inicializo las áreas mínimas de las teselas para cada nivel de zoom
	Sesion.tesAreaminZoom = {};
	// inicializo las teselas pintadas
	Sesion.tesPintadas = {};
	// inicializo las parcelas pintadas
	Sesion.parPintadas = {};
	Sesion.radioParPintadas = config.radioParcela; // 300 metros de radio por defecto
	// inicializo los árboles pintados
	Sesion.arbPintados = {};
	// inicializo las parcelas en zoom de árbol pintadas
	Sesion.parcarbPintadas = {};
	// para que no cargue indefinidas veces la capa
	Sesion.provsCargadas = false;

	// INICIALIZACIÓN DATOS
	Datos = {};
	Datos.taxones = {};
	Datos.usos = {};	
	Datos.provs = {};
	Datos.arboles = {};
	Datos.parcelas = {};
	Datos.teselas = {};
	Datos.ladosCeldas = {}; // aquí calculo el lado de cada celda por nivel de zoom
	Datos.celdasTeselas = {}; // aquí incluyo las IRIs de las teselas en cada celda
	Datos.celdasParcelas = {}; // aquí incluyo las IRIs de las teselas en cada celda
	Datos.newtaxons={};

    cargarURL(true);

    let pedirgeopos = false;
	if (!Sesion.estado.loc) { // precargo localización de la configuración
		Sesion.estado.loc = {
			lat: config.geolocstart[0],
			lng: config.geolocstart[1],
			z: config.zStart
		};
		if (Sesion.estado.path === 'map' && !localStorage.getItem('tourCompletado')) // pido geopos si está en modo mapa y no ha hecho el tour
			pedirgeopos = true;
	}

	// console.log("Sesion.estado.path",Sesion.estado.path);
    // INICIALIZO MAPA
    initializeMap();

	cargarBotonesMapa();


	// INICIALIZACIÓN CRAFTS
	console.time("Configuración proveedor de datos");
	Crafts = new CraftsAPI(config.craftsConfig);
	
	Crafts.test()
		.then((result) => {			
			// OK

			console.log('Promise resolved successfully')
			console.info("Proveedor de datos funciona");						
			console.timeEnd("Configuración proveedor de datos");
			
			// CARGO PANEL (inicialmente desactivado el filtro de taxón)
			//TODO THESE 2 FUNCTIONS AFTERWARDS HANDLING THE TAXONS
			cargarPanel();

			configurarSolr();
						
			// TODO: ¿hacer lo del puppeteer?			
			// console.log(Sesion.zoom)
			// Sesion.zoom=7;	

			Mimapa.on('moveend', mapaMovido);
			Sesion.listenerMoveend = true; // para ajustar localización si hay que inicializar a la posición del usuario

			// INICIALIZACIONES CRAFTS
			console.group("Inicialización de datos");

			// obtengo datos de los usos para las teselas
			console.time("Carga de datos de usos");
			getUsesInfo()
				.then(() => {
					console.info("Info de usos cargada");
					console.timeEnd("Carga de datos de usos");
				})
				.catch(error => console.error(error));

			// obtengo datos de todos los taxones
			console.time("Carga de datos de taxones");

			getTaxonsInfo()
				.then(() => {
					console.info("Info de taxones cargada");
					console.timeEnd("Carga de datos de taxones");				
					// habilito el botón de filtrar por taxón (desactivado hasta ahora)
					$("#bot_taxones").removeAttr('disabled');
					
					// obtengo datos de las provincias (espero a tener los datos de especies para hacerlo)
					console.time("Carga de datos de provincias");
					taxonsChange()	
					getProvincesInfo()
						.then(() => {
							console.info("Info de provincias cargada");
							console.timeEnd("Carga de datos de provincias");
							console.groupEnd();
							
					
							// AQUÍ SE HACE LA PRIMERA ACTUALIZACIÓN COMPLETA DEL MAPA
							cargarURL();
						})
						.catch(error => console.error(error));
				})
				.catch(error => console.error(error));

		})
		.catch(error => {
			console.error(error);
			console.timeEnd("Configuración proveedor de datos");
			// aviso error
			errorProveedorDatosIrrecuperable(error);
		});

	window.onpopstate = function(event) {
			// cargo la URL
		cargarURL();
	};

	
	

	Layers.provs = inicializarProvincias();
	// // INICIALIZO LayerGroup DE PARCELAS
	Layers.parcs = L.layerGroup().addTo(Mimapa);	
	// // INICIALIZO LayerGroup DE ÁRBOLES
	Layers.arbs = L.layerGroup().addTo(Mimapa);

	generaIconos();




};
	// 		// CONFIGURACIÓN SOLR
	// 		configurarSolr();
						
	// 		// TODO: ¿hacer lo del puppeteer?			
	// 		console.log(Sesion.zoom)	
	// 		// DETECCIÓN DE CAMBIOS EN EL MAPA
	// 		Mimapa.on('moveend', mapaMovido);
	// 		Sesion.listenerMoveend = true; // para ajustar localización si hay que inicializar a la posición del usuario
			
	// 		// INICIALIZACIONES CRAFTS
	// 		console.group("Inicialización de datos");
	// })


function configurarSolr() {
		//console.group("Inicialización motor de texto");
	console.time("Configuración motor de texto");
		
		// inicializo Solr
	// console.log(Solr);
	Solr = new TextEngine(config.solrConfig.path + config.solrConfig.suggestHandler,
		config.solrConfig.path + config.solrConfig.selectHandler);
	// console.log(Solr);
	Solr.test()
		.then(() => {
				// OK
			console.info("Motor de texto funciona");						
			console.timeEnd("Configuración motor de texto");
				// muestro la entrada de los lugares
			renderEntradaLugares(true);
		})
		.catch(messageError => {			
				// log del error
			console.error(messageError);
			console.timeEnd("Configuración motor de texto");			
			// pongo Solr a null y escondo la entrada de los lugares
			Solr = null;
			renderEntradaLugares(true);			
		});
};

function errorProveedorDatosIrrecuperable(messageError) {
	// ya no tiene sentido pedir datos
	Sesion.errordataprov = true; 
		
	// pongo un modal para avisar de que no se puede explorar el inventario	
	configurarModal( { vertcent: true, nofooter: true }, 
		getLiteral(dict.errorEndpointTitle), getLiteral(dict.errorEndpointText), null);
	const mimodal = new bootstrap.Modal(document.getElementById('mimodal'));
	mimodal.show();

	// quito temporizador
	finActualizarMapa();
}



function cargarURL(inicial) {
	//console.warn(window.location);
	// 1) elimino alguna info del estado de la sesión
	delete Sesion.estado.path;
	Sesion.taxones = []; // puede que no haya que borrarlo (si hubiera páginas de parcelas u otras cosas)
	delete Sesion.zoom; // no es estado, pero lo borro para evitar desajustes


	// 2) actualizo el estado de la sesión a partir de la URL	
	// parseo del querystring de la URL
	const urlParams = new URLSearchParams(window.location.search);

	console.log(urlParams)
	// actualizo localización si hay localización y está bien
	// en otro caso no borro la localización que hubiera
	const cadloc = urlParams.get('loc');
	if (cadloc != null) {
		const loc = string2loc(cadloc);
		if (loc != null) 
			Sesion.estado.loc = loc;
	}

	// obtengo el path y valido
	const pathels = window.location.pathname.split("/");
	switch(pathels[1]) { // sólo considero el elemento 1 del path (el 0 será "")
		case "map":
			Sesion.estado.path = pathels[1];
			// extraigo la configuración del mapa de parámetros "mapType", "mapDetails", "plots"
			// valores válidos los de config.mapConfig (y valor por defecto el 0)
			for (let mappar in config.mapConfig) {
				const val = urlParams.get(mappar);
				const valdef = config.mapConfig[mappar][0];
				Sesion.estado[mappar] = (val && config.mapConfig[mappar].includes(val))? val : valdef;
				// conversión de "true" y "false"
				if (Sesion.estado[mappar] === "true")
					Sesion.estado[mappar] = true;
				else if (Sesion.estado[mappar] === "false")
					Sesion.estado[mappar] = false;
			}
			/*
			// extraigo la capa (layer). Valores posibles los de config.validLayers: [ "auto", "landcover", "esri", "pnoa", "region", "municipality" ]
			if (urlParams.get('layer') != null && config.validLayers.includes(urlParams.get('layer')))
				Sesion.estado.layer = urlParams.get('layer');
			else
				Sesion.estado.layer = config.validLayers[0]; // valor por defecto "auto"*/
			break;
		default:	// si no hay path o no es válido voy al mapa y a volar
			Sesion.estado.path = "map";
			// inicializo la configuración del mapa por defecto
			for (let mappar in config.mapConfig)
				Sesion.estado[mappar] = config.mapConfig[mappar][0];	
			/*
			if (!Sesion.estado.layer) // e inicializo también el layer, por si acaso
				Sesion.estado.layer = config.validLayers[0]; // valor por defecto "auto"
				*/
			break;
	}
	// en modo mapa incluyo filtros de taxones si están presentes o si es el caso inicial (antes de cargar las especies)
	if (Sesion.estado.path === "map" && urlParams.get('tx')) {		
		let taxones = urlParams.getAll('tx'); // devuelve un array (puede haber múltiples valores)
		// inicializo un objeto para evitar repeticiones
		let objt = {};
		for (let tx of taxones) {
			// expando el taxón con el prefijo (si es que lo hay)
			const taxon = expandPrefix(tx, config.prefixes);
			// incluyo si caso inicial o si existe en el catálogo de taxones			
			if (inicial || Datos.taxones[taxon])
				objt[taxon] = true;
		}
		// guardo en la sesión evitando superar el número máximo de filtros de taxones
		let contt = 0;
		for (let taxon in objt) {
			if (contt < config.maxTaxonFilters) {
				Sesion.taxones.push(taxon);
				// elijo un color aleatoriamente entre los posibles si no hubiera color
				if (!Sesion.taxonesColores[contt]) {
					const cols = _.difference(config.coltxinds, Sesion.taxonesColores);
					const ind = Math.floor(Math.random() * cols.length);
					Sesion.taxonesColores.push(cols[ind]);
				}
				contt++;
			}
		}		
	}

	console.log(Sesion.estado);

	switch(Sesion.estado.path) {
		case "map":
			// desbloqueo actualizaciones del mapa 
			Sesion.actualizandoMapa = false;			
			// pongo vista mapa
			vistaMapa(true);
			
			// actualizo título de la página
			document.title = getLiteral(dict.map) + ' - ' + getLiteral(dict.title);
			// propiedades meta
			$("meta[property='og:title']").attr('content', document.title);
			$("meta[property='og:description']").attr('content', 'Navigating the map of Forest Explorer.');
			
			// si no es la llamada inicial hago más cosas...
			if (!inicial) {
				// visualización filtros de taxón
				visualizarFiltrosTaxon();
				
				// actualización colores y popups teselas forestales
				const turis = Object.keys(Sesion.tesPintadas);
				ajustarColorTeselas(turis, false);
				ajustarPopupsTeselas(turis, false);
				
				// actualización colores y popups parcelas
				const puris = Object.keys(Sesion.parPintadas);
				ajustarColorParcelas(puris);
				ajustarPopupsParcelas(puris);
				
				// actualización colores y popups árboles
				const pauris = Object.keys(Sesion.parcarbPintadas);
				ajustarColorArboles(pauris);
				ajustarPopupsArboles(pauris);
				
				// actualización colores y popups provincias
				ajustarColorProvincias();
				ajustarPopupsProvincias();
				
				// actualizo mapa base
				actualizarMapaBase();

				// centro el mapa en la localización de la sesión
				// esto dispara un evento de mapa movido, disparando su actualización en MODO MAPA
				Mimapa.setView([Sesion.estado.loc.lat, Sesion.estado.loc.lng], Sesion.estado.loc.z);
		
				// incluyo esto para que el mapa se reajuste
				// parece que así se resuelve el problema que había al pasar de recurso a mapa
				// tengo que poner esto después del setview, en otro caso no reacciona al setview
				Mimapa.invalidateSize();
				
				console.log(Sesion.zoom)
				/* TODO
				// tour inicial
				if (!localStorage.getItem('tourCompletado'))
					lanzarTour();*/		
			}
			break;
		// TODO página de tesela
		// TODO página de parcela
		// TODO página de árbol
	} // fin del switch
}

function obtenerURL() { // devuelve la URL a partir de Sesion.estado
	// preparo la URL base con el path de Sesion.estado.path
	const { protocol, host } = window.location;
	let url = protocol + '//' + host + '/' + Sesion.estado.path;
	/*
	// caso etid (segunda variable de path)
	if (Sesion.estado.etid) 
		url += '/' + Sesion.estado.etid;*/
	// preparo searchpars
	const searchpars = [];
	if (Sesion.estado.loc && Sesion.estado.path === "map")
		searchpars.push('loc=' + loc2string(Sesion.estado.loc));
	if (Sesion.estado.path === "map") {
		// configuración del mapa				
		for (let mappar in config.mapConfig) 
			searchpars.push(mappar + '='+Sesion.estado[mappar]);	
		//searchpars.push('layer='+Sesion.estado.layer);
	}
	if (Sesion.taxones && Sesion.estado.path === "map") {
		for (let taxon of Sesion.taxones) {
			// aplico prefijo
			const tx = applyPrefix(taxon, config.prefixes);
			searchpars.push('tx=' + tx);
		}
	}	
		/*
	if (Sesion.estado.pe && (Sesion.estado.path === "user" || Sesion.estado.path === "lasttrees")) 
		searchpars.push('pe=' + Sesion.estado.pe);
	if (Sesion.estado.pae && (Sesion.estado.path === "user" || Sesion.estado.path === "lasttrees")) 
		searchpars.push('pae=' + Sesion.estado.pae);
	if (Sesion.estado.showann && (Sesion.estado.path === "user" || Sesion.estado.path === "lasttrees")) 
		searchpars.push('showann=true');*/
		
	// incluyo los searchpars
	for (let i=0; i<searchpars.length; i++) {
		const sep = i==0? '?' : '&';
		url += sep + searchpars[i];
	}
	return url;
}

function vistaMapa(esmapa) {
	// ajuste propiedad meta de la url
	$("meta[property='og:url']").attr('content', window.location.href);
	if (esmapa) {
		// actualizo viewport (escala fijada)
		$("#miviewport").attr("content","width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no");
		/*
		// escondo miarbol y muestro mapa
		$("#miarbol").html(''); // borro contenido página
		$("#miarbol").addClass("d-none");
		$("#mimapa").removeClass("d-none");		*/	
	}
	else {
		// actualizo viewport (puede ampliarse)
		$("#miviewport").attr("content","width=device-width, initial-scale=1, shrink-to-fit=no");
		/*
		// escondo mapa y muestro página del árbol
		$("#mimapa").addClass("d-none");
		$("#miarbol").html(''); // borro contenido página
		$("#miarbol").removeClass("d-none");*/
	}
}

export{Sesion, Layers, Datos,Solr,Crafts,CachedQueries, obtenerURL, cargarURL};